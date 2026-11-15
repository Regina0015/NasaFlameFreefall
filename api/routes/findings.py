from fastapi import APIRouter, HTTPException, Query, Request

from api.schemas import FindingEntry, FindingList
from api.store import summary

router = APIRouter()
GRADE_FILTER = "^(A|B|C|no_data|rejected|pending audit)$"


@router.get("/findings", response_model=FindingList, summary="Stored findings with their grade")
def list_findings(request: Request, grade: str | None = Query(None, pattern=GRADE_FILTER),
                  investigation: str | None = Query(None, description="e.g. PSI-25"),
                  include_rejected: bool = False) -> FindingList:
    """Rejected findings are never published (`_config/confidence.md`), so they are left out unless asked for."""
    store = request.app.state.store
    shown, rejected = [], 0
    for fid in store.finding_ids():
        try:
            finding = store.load_finding(fid)
        except ValueError:
            continue
        row = summary(store, fid)
        if row["grade"] == "rejected" and not include_rejected:
            rejected += 1
            continue
        if grade and row["grade"] != grade:
            continue
        if investigation and not any(e.get("investigation") == investigation for e in finding.get("evidence") or []
                                     if isinstance(e, dict)):
            continue
        shown.append(FindingEntry(**row, finding=finding))
    return FindingList(findings=shown, rejected_not_shown=rejected)


@router.get("/findings/{finding_id}", response_model=FindingEntry, summary="One finding with its grade")
def get_finding(finding_id: str, request: Request) -> FindingEntry:
    store = request.app.state.store
    try:
        finding = store.load_finding(finding_id)
    except ValueError as error:
        raise HTTPException(404, str(error))
    return FindingEntry(**summary(store, finding_id), finding=finding)
