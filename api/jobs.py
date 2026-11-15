"""Audits run one at a time: Gemma needs the whole GPU, and auditar.py writes shared files."""
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone

from scripts.audit_step import auditor_command, run_audit

from api.store import Store

MAX_JOBS_KEPT = 200


@dataclass
class Job:
    id: str
    finding_id: str
    version: int
    use_model: bool
    future: Future
    created: str = field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    started: bool = False

    @property
    def status(self) -> str:
        if self.future.done():
            return "failed" if self.future.exception() else "done"
        return "running" if self.started else "queued"


class AuditQueue:
    def __init__(self, store: Store):
        self.store = store
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="auditor")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def submit(self, fid: str, version: int, use_model: bool) -> Job:
        job = Job(uuid.uuid4().hex[:12], fid, version, use_model, Future())
        job.future = self._pool.submit(self._run, job)
        with self._lock:
            self._jobs[job.id] = job
            for old in list(self._jobs)[:-MAX_JOBS_KEPT]:
                if self._jobs[old].future.done():
                    del self._jobs[old]
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def pending(self) -> int:
        with self._lock:
            return sum(1 for j in self._jobs.values() if not j.future.done())

    def _run(self, job: Job) -> dict:
        job.started = True
        path = self.store.finding_path(job.finding_id)
        command = auditor_command(job.finding_id, self.store.findings_dir, self.store.base)
        if not job.use_model:
            command.append("--no-model")
        return run_audit(path, command, self.store.base)
