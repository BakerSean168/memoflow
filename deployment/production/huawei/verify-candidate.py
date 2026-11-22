#!/usr/bin/env python3
"""Fail-closed structural validation for the existing Huawei Compose deployment.

Only application image references, API version and the newly introduced
OAuth-write environment key may change. Infrastructure/runtime is immutable.
"""
import copy
import json
import re
import sys

DIGEST = re.compile(r'^ghcr\.io/bakersean168/memoflow-(api|web|migrator)@sha256:[a-f0-9]{64}$')
VERSION = re.compile(r'^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$|^\d+\.\d+\.\d+$')


def verify(current, candidate, images, version):
    if not VERSION.fullmatch(version):
        raise ValueError('invalid release version')
    if set(current.get('services', {})) != {'api', 'web', 'migrator', 'postgres', 'redis', 'powersync', 'caddy'}:
        raise ValueError('unexpected current Compose services')
    expected = copy.deepcopy(current)
    for service in ('api', 'web', 'migrator'):
        ref = images.get(service, '')
        match = DIGEST.fullmatch(ref)
        if match is None or match.group(1) != service:
            raise ValueError('invalid immutable application image for ' + service)
        expected['services'][service]['image'] = ref
    expected['services']['api']['environment']['APP_VERSION'] = version
    # This one additive environment variable is part of #1055. All other
    # environment variables, including existing authorization, stay unchanged.
    expected['services']['api']['environment'].setdefault('EAG_OAUTH_WRITE_ENABLED', '0')
    if candidate != expected:
        raise ValueError('candidate changes Compose beyond allowed app images/version/OAuth-write default')
    return True


def main(argv):
    if len(argv) != 7:
        raise SystemExit('usage: verify-candidate.py current.json candidate.json api_ref web_ref migrator_ref version')
    with open(argv[1], encoding='utf8') as f:
        current = json.load(f)
    with open(argv[2], encoding='utf8') as f:
        candidate = json.load(f)
    verify(current, candidate, dict(zip(('api', 'web', 'migrator'), argv[3:6])), argv[6])
    print('HUAWEI_CANDIDATE=SAFE')


if __name__ == '__main__':
    try:
        main(sys.argv)
    except (ValueError, KeyError, TypeError) as exc:
        raise SystemExit('HUAWEI_CANDIDATE=REJECTED: ' + str(exc)) from None
