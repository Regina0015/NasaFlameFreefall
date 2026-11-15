from concurrent.futures import TimeoutError as FutureTimeout

from fastapi import APIRouter, HTTPException, Request, Response

from api import config
from api.jobs import Job
from api.schemas import AuditList, AuditRequest, AuditResponse, AuditSummary
from api.store import Conflict, failed_checks, model_used, summary
from scripts.audit_step import FAILED

router = APIRouter()


def _from_verdict(fid: str, version: int, verdict: dict, **extra) -> AuditResponse:
    return AuditResponse(status="done", finding_id=fid, finding_version=version, grade=verdict["grade"],
                         failed_checks=failed_checks(verdict), reasons=verdict.get("reasons") or [],
                         send_back_to=verdict.get("send_back_to"), finding_sha256=verdict.get("finding_sha256"),
                         model_used=model_used(verdict), audit=verdict, **extra)


def _from_job(job: Job, stored: str | None) -> AuditResponse:
    """Turn a finished (or still running) job into a response. A grade only ever comes from a real audit."""
    common = dict(job_id=job.id, finding_id=job.finding_id, finding_version=job.version, stored=stored)
    if job.status in ("queued", "running"):
        return AuditResponse(status=job.status, **common)
    error = job.future.exception()
    result = None if error else job.future.result()
    if error or result is None or result.get("status") == FAILED or "grade" not in result:
        detail = str(error) if error else (result or {}).get("detail", FAILED)
        return AuditResponse(status="failed", detail=detail, **common)
    return _from_verdict(job.finding_id, job.version, result, job_id=job.id, stored=stored)


@router.post("/audit", response_model=AuditResponse, summary="Audit a finding (Calculator -> Auditor)",
             responses={202: {"model": AuditResponse, "description": "Still running: poll GET /audits/jobs/{job_id}"}})
def post_audit(body: AuditRequest, request: Request, response: Response) -> AuditResponse:
    """Stores the finding, audits it with `scripts/auditar.py` and returns the grade with its checks.

    A `rejected` grade is a normal result (HTTP 200): the Auditor reports, it never fixes. Send it back to the
    stage named in `send_back_to`. If the audit takes longer than 30 s you get 202 and a `job_id`."""
    store, queue = request.app.state.store, request.app.state.queue
    try:
        _, stored = store.save_finding(body.finding)
    except Conflict as error:
        raise HTTPException(409, str(error))
    except ValueError as error:
        raise HTTPException(422, str(error))
    fid, version = body.finding["id"], body.finding["version"]

    cached = store.verdict(fid)
    if cached is not None and not body.reaudit and (model_used(cached) or not body.use_model):
        return _from_verdict(fid, version, cached, stored=stored, cached=True)

    job = queue.submit(fid, version, body.use_model)
    try:
        job.future.result(timeout=config.SYNC_WAIT_S)
    except FutureTimeout:
        response.status_code = 202
        return _from_job(job, stored)
    except Exception:  # the failure is reported by _from_job, not as a crash
        pass
    result = _from_job(job, stored)
    if result.status == "failed":
        response.status_code = 502
    return result


@router.get("/audits/jobs/{job_id}", response_model=AuditResponse, summary="Result of a queued audit")
def get_job(job_id: str, request: Request, response: Response) -> AuditResponse:
    job = request.app.state.queue.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job id (the gateway keeps the last 200 jobs and forgets them on restart).")
    result = _from_job(job, None)
    if result.status in ("queued", "running"):
        response.status_code = 202
    return result


@router.get("/audits", response_model=AuditList, summary="Grade of every stored finding")
def list_audits(request: Request) -> AuditList:
    store = request.app.state.store
    return AuditList(audits=[AuditSummary(**summary(store, fid)) for fid in store.finding_ids()])


@router.get("/audits/{finding_id}", response_model=AuditResponse, summary="Full audit of one finding")
def get_audit(finding_id: str, request: Request) -> AuditResponse:
    store = request.app.state.store
    try:
        finding = store.load_finding(finding_id)
    except ValueError as error:
        raise HTTPException(404, str(error))
    verdict = store.verdict(finding_id)
    if verdict is None:
        # No valid audit for this exact version: say so, never invent a grade.
        return AuditResponse(status="failed", finding_id=finding_id, finding_version=finding["version"],
                             grade="pending audit", detail="No audit matches the stored version of this finding.")
    return _from_verdict(finding_id, finding["version"], verdict)
