from app.domain.errors import DomainError
from app.interface.handlers.errors import ERROR_STATUSES


def _all_subclasses(error: type[DomainError]) -> set[type[DomainError]]:
    direct = set(error.__subclasses__())
    return direct.union(*(_all_subclasses(sub) for sub in direct))


def test_every_domain_error_has_an_http_status():
    unmapped = {error.__name__ for error in _all_subclasses(DomainError) - ERROR_STATUSES.keys()}

    assert unmapped == set()
