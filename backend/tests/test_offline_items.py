import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('SECRET_KEY', 'backend-tests-only-secure-key-with-more-than-enough-entropy-123456789')

from models import Base, ListItem, ShoppingList, User  # noqa: E402
from routers.items_router import clear_checked_items, create_item  # noqa: E402
from schemas import ClearCheckedRequest, ItemCreate  # noqa: E402


@pytest.fixture()
def database():
    engine = create_engine(
        'sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = User(id=str(uuid.uuid4()), username='tester', email='tester@example.com', password_hash='x')
    shopping_list = ShoppingList(id=str(uuid.uuid4()), name='Groceries', owner_id=user.id)
    other_list = ShoppingList(id=str(uuid.uuid4()), name='Other', owner_id=user.id)
    session.add_all([user, shopping_list, other_list])
    session.commit()
    yield session, user, shopping_list, other_list
    session.close()
    engine.dispose()


def test_client_uuid_creation_is_idempotent_and_collisions_are_rejected(database):
    db, user, shopping_list, other_list = database
    item_id = uuid.uuid4()
    first = asyncio.run(create_item(
        shopping_list.id, ItemCreate(id=item_id, name='Milk'), user, db,
    ))
    repeated = asyncio.run(create_item(
        shopping_list.id, ItemCreate(id=item_id, name='A changed retry body'), user, db,
    ))

    assert first.id == str(item_id)
    assert repeated.id == first.id
    assert repeated.name == 'Milk'
    assert db.query(ListItem).filter(ListItem.id == str(item_id)).count() == 1

    with pytest.raises(HTTPException) as error:
        asyncio.run(create_item(
            other_list.id, ItemCreate(id=item_id, name='Collision'), user, db,
        ))
    assert error.value.status_code == 409


def test_clear_checked_only_removes_the_captured_ids(database):
    db, user, shopping_list, _ = database
    captured = ListItem(id=str(uuid.uuid4()), list_id=shopping_list.id, name='Captured', checked=True, added_by=user.id)
    checked_later = ListItem(id=str(uuid.uuid4()), list_id=shopping_list.id, name='Checked later', checked=True, added_by=user.id)
    unchecked = ListItem(id=str(uuid.uuid4()), list_id=shopping_list.id, name='Unchecked', checked=False, added_by=user.id)
    db.add_all([captured, checked_later, unchecked])
    db.commit()
    captured_id, later_id, unchecked_id = captured.id, checked_later.id, unchecked.id

    result = asyncio.run(clear_checked_items(
        shopping_list.id, ClearCheckedRequest(item_ids=[captured_id]), user, db,
    ))

    remaining = {item.id for item in db.query(ListItem).all()}
    assert result == {'deleted_count': 1}
    assert captured_id not in remaining
    assert later_id in remaining
    assert unchecked_id in remaining


def test_omitted_clear_body_preserves_existing_behavior(database):
    db, user, shopping_list, _ = database
    db.add_all([
        ListItem(list_id=shopping_list.id, name='Done 1', checked=True, added_by=user.id),
        ListItem(list_id=shopping_list.id, name='Done 2', checked=True, added_by=user.id),
        ListItem(list_id=shopping_list.id, name='Keep', checked=False, added_by=user.id),
    ])
    db.commit()

    result = asyncio.run(clear_checked_items(shopping_list.id, None, user, db))
    assert result == {'deleted_count': 2}
    assert [item.name for item in db.query(ListItem).all()] == ['Keep']
