#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""
tb-rust vendor things.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

transforms = TransformSequence()


@transforms.add
def resolve_keys(config, jobs):
    for job in jobs:
        for item in ("ssh-key-secret", "phab-token-secret"):
            resolve_keyed_by(job, item, item, **{"level": str(config.params["level"])})
        yield job


@transforms.add
def update_scopes(config, jobs):
    for job in jobs:
        for item in ("ssh-key-secret", "phab-token-secret"):
            secret = job.pop(item)
            if secret:
                job.setdefault("scopes", []).append(f"secrets:get:{secret}")
        yield job
