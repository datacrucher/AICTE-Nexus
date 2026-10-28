from sqlalchemy.orm import Session
from .models import AuditEvent, User
def record(db: Session, user: User | None, action: str, application_id=None, target_type=None, target_ref=None, from_value=None, to_value=None, remarks=None, is_seed=False):
    """Writes in the caller's transaction, so a business change and its audit event commit (or roll back) together."""
    db.add(AuditEvent(actor_id=user.id if user else None, actor_role=user.role if user else "system", action=action, application_id=application_id, target_type=target_type,
                      target_ref=target_ref, from_value=from_value, to_value=to_value, remarks=remarks, is_seed=is_seed))
