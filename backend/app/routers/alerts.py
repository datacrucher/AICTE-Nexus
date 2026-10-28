from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..alerts import build_alerts
from ..db import get_db
from ..models import User
from ..security import current_user
router = APIRouter(tags=["alerts"])
@router.get("/alerts")
def alerts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"alerts": build_alerts(db, user), "truncated": False}
