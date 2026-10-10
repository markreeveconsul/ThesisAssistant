"""Serialize index/storage mutations for a project in the single-worker MVP."""

from functools import wraps
from threading import Lock
from weakref import WeakValueDictionary

_locks: WeakValueDictionary = WeakValueDictionary()
_registry_lock = Lock()


def project_mutation(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        project_id = kwargs["project_id"]
        with _registry_lock:
            lock = _locks.get(project_id)
            if lock is None:
                lock = Lock()
                _locks[project_id] = lock
        with lock:
            return function(*args, **kwargs)
    return wrapped
