"""Request and response models. The finding and audit bodies follow schemas/finding.schema.json and
schemas/audit.schema.json; the Auditor validates them (C0), so the API passes them through as objects."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Grade = Literal["A", "B", "C", "no_data", "rejected", "pending audit"]


class AuditRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"finding": {"id": "F-001", "version": 2, "...": "full finding"}, "use_model": True}]})

    finding: dict = Field(description="The complete finding (schemas/finding.schema.json), exactly as the Calculator saved it.")
    use_model: bool = Field(True, description="False: code checks only; C8 stays 'fail' for manual review (auditar.py --no-model).")
    reaudit: bool = Field(False, description="True: audit again even if a valid audit of this exact finding already exists.")


class AuditResponse(BaseModel):
    status: Literal["done", "queued", "running", "failed"]
    job_id: str | None = None
    finding_id: str
    finding_version: int
    stored: Literal["new", "same", "new_version"] | None = Field(None, description="What the gateway did with the received finding.")
    grade: Grade | None = None
    failed_checks: list[str] = []
    reasons: list[str] = []
    send_back_to: str | None = Field(None, description="Which stage must fix the finding when the grade is 'rejected'.")
    finding_sha256: str | None = None
    model_used: bool | None = None
    cached: bool = False
    audit: dict | None = Field(None, description="The full audit (schemas/audit.schema.json): checks C0-C9, recalculation, text review.")
    detail: str | None = Field(None, description="Why the audit failed to run (status 'failed'). Never a grade.")


class AuditSummary(BaseModel):
    finding_id: str
    finding_version: int
    grade: Grade
    failed_checks: list[str]
    stale_audit: bool = Field(description="An audit exists but belongs to another version of the finding: it does not count.")
    finding_sha256: str | None
    model_used: bool
    audited_at: str | None


class AuditList(BaseModel):
    audits: list[AuditSummary]


class FindingEntry(AuditSummary):
    finding: dict


class FindingList(BaseModel):
    findings: list[FindingEntry]
    rejected_not_shown: int


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    ollama: dict
    duckdb: bool
    psi_tables: int
    snapshot: bool
    findings_stored: int
    audits_pending: int
    api_key_set: bool
