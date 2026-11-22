import copy
import importlib.util
import pathlib
import unittest

MODULE = pathlib.Path(__file__).with_name('verify-candidate.py')
spec = importlib.util.spec_from_file_location('candidate_verifier', MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

IMAGES = {name: f'ghcr.io/bakersean168/memoflow-{name}@sha256:' + letter * 64 for name, letter in [('api', 'a'), ('web', 'b'), ('migrator', 'c')]}


def current():
    return {
        'name': 'memoflow',
        'services': {name: {'image': f'memoflow-local/{name}:current', 'environment': {}} for name in ('api', 'web', 'migrator', 'postgres', 'redis', 'powersync', 'caddy')},
        'networks': {'memoflow-network': {'name': 'memoflow_memoflow-network'}},
        'volumes': {'postgres-prod-data': {'name': 'memoflow_postgres-prod-data'}},
    }


def candidate(c):
    d = copy.deepcopy(c)
    for name, ref in IMAGES.items():
        d['services'][name]['image'] = ref
    d['services']['api']['environment']['APP_VERSION'] = '0.23.0-nightly.20261122.170'
    d['services']['api']['environment']['EAG_OAUTH_WRITE_ENABLED'] = '0'
    return d


class CandidateGuardTest(unittest.TestCase):
    def test_only_apps_and_new_default(self):
        c = current()
        self.assertTrue(module.verify(c, candidate(c), IMAGES, '0.23.0-nightly.20261122.170'))

    def test_rejects_runtime_or_network_changes(self):
        c = current()
        for mutate in (
            lambda d: d['services']['postgres'].__setitem__('image', 'evil:latest'),
            lambda d: d['networks'].__setitem__('extra', {}),
            lambda d: d['services']['api']['environment'].__setitem__('JWT_SECRET', 'leaked'),
            lambda d: d['services']['caddy'].__setitem__('ports', ['8080:80']),
        ):
            d = candidate(c)
            mutate(d)
            with self.assertRaises(ValueError):
                module.verify(c, d, IMAGES, '0.23.0-nightly.20261122.170')

    def test_rejects_unpinned_or_mismatched_release(self):
        c = current()
        with self.assertRaises(ValueError):
            module.verify(c, candidate(c), dict(IMAGES, api='ghcr.io/bakersean168/memoflow-api:latest'), '0.23.0-nightly.20261122.170')
        with self.assertRaises(ValueError):
            module.verify(c, candidate(c), IMAGES, 'nonsense')

    def test_preserves_enabled_existing_oauth_write(self):
        c = current()
        c['services']['api']['environment']['EAG_OAUTH_WRITE_ENABLED'] = '1'
        d = candidate(c)
        d['services']['api']['environment']['EAG_OAUTH_WRITE_ENABLED'] = '1'
        self.assertTrue(module.verify(c, d, IMAGES, '0.23.0-nightly.20261122.170'))


if __name__ == '__main__':
    unittest.main()
