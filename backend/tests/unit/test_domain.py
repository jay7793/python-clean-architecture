import pytest

from app.domain.entities.page import Page
from app.domain.errors import InvalidCredentials


@pytest.mark.parametrize(
    ("total_data", "page_size", "total_page"),
    [(0, 10, 0), (3, 2, 2), (4, 2, 2), (5, 10, 1)],
)
def test_page_count_covers_every_row_not_just_this_page(total_data, page_size, total_page):
    page = Page(data=["only", "two"], page=1, page_size=page_size, total_data=total_data)

    assert page.total_page == total_page


def test_invalid_credentials_does_not_reveal_which_field_was_wrong():
    assert str(InvalidCredentials()) == "invalid email or password"
