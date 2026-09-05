import io
import hashlib
import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from flask import Flask

BT_FILE_MANAGER_PATH = Path(__file__).parents[1] / 'scripts' / 'bt_file_manager.py'
BT_FILE_MANAGER_SPEC = importlib.util.spec_from_file_location('bt_file_manager', BT_FILE_MANAGER_PATH)
bt_file_manager = importlib.util.module_from_spec(BT_FILE_MANAGER_SPEC)
sys.modules['bt_file_manager'] = bt_file_manager
BT_FILE_MANAGER_SPEC.loader.exec_module(bt_file_manager)
BtFileManager = bt_file_manager.BtFileManager
register_routes = bt_file_manager.register_routes


VALID_XML = '''<?xml version="1.0"?>
<root BTCPP_format="4" main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree"><Sequence /></BehaviorTree>
</root>
'''


class FakeDownload:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size=-1):
        return self.payload.read(size)


class BtFileManagerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.manager = BtFileManager(str(self.root))
        self.app = Flask(__name__)
        register_routes(self.app, '', self.manager)

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def unpack_response(response):
        if isinstance(response, tuple):
            return response
        return response, response.status_code

    def test_validate_xml_accepts_behavior_tree_document(self):
        self.assertIsNone(self.manager.validate_xml(VALID_XML))

    def test_validate_xml_rejects_non_root_document(self):
        self.assertEqual(self.manager.validate_xml('<not_root />'), 'The XML document root must be <root>.')

    def test_resolve_file_rejects_path_traversal_and_non_xml(self):
        with self.assertRaises(ValueError):
            self.manager.resolve_file('../outside.xml')
        with self.assertRaises(ValueError):
            self.manager.resolve_file('tree.txt')

    def test_create_file_and_get_file_return_revision(self):
        (self.root / 'trees').mkdir()
        with self.app.test_request_context('/bt/file', json={'path': 'trees/main.xml'}):
            response = self.manager.create_file()
        response, status_code = self.unpack_response(response)
        self.assertEqual(status_code, 201)
        created = response.get_json()
        self.assertEqual(created['path'], 'trees/main.xml')
        self.assertTrue(created['revision'])

        with self.app.test_request_context('/bt/file/trees/main.xml'):
            response = self.manager.get_file('trees/main.xml')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['content'], BtFileManager.DEFAULT_XML)

    def test_save_file_requires_current_revision(self):
        target = self.root / 'main.xml'
        target.write_text(VALID_XML, encoding='utf-8')

        with self.app.test_request_context('/bt/file/main.xml', method='PUT', json={
            'content': '<root />', 'revision': 'stale'
        }):
            response = self.manager.save_file('main.xml')
        _, status_code = self.unpack_response(response)
        self.assertEqual(status_code, 409)
        self.assertEqual(target.read_text(encoding='utf-8'), VALID_XML)

    def test_save_file_updates_content_with_current_revision(self):
        target = self.root / 'main.xml'
        target.write_text(VALID_XML, encoding='utf-8')
        current_revision = hashlib.sha256(VALID_XML.encode('utf-8')).hexdigest()
        updated_xml = VALID_XML.replace('<Sequence />', '<Fallback />')

        with self.app.test_request_context('/bt/file/main.xml', method='PUT', json={
            'content': updated_xml, 'revision': current_revision
        }):
            response = self.manager.save_file('main.xml')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(target.read_text(encoding='utf-8'), updated_xml)
        self.assertEqual(response.get_json()['revision'], hashlib.sha256(updated_xml.encode('utf-8')).hexdigest())

    def test_delete_file_removes_xml(self):
        target = self.root / 'main.xml'
        target.write_text(VALID_XML, encoding='utf-8')

        with self.app.test_request_context('/bt/file/main.xml', method='DELETE'):
            response = self.manager.delete_file('main.xml')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(target.exists())

    def test_list_subtrees_finds_definitions_in_other_xml_files(self):
        (self.root / 'main.xml').write_text(VALID_XML, encoding='utf-8')
        (self.root / 'subtrees.xml').write_text('''<root>
  <BehaviorTree ID="DockingTree"><Sequence /></BehaviorTree>
</root>
''', encoding='utf-8')

        with self.app.test_request_context('/bt/subtrees?path=main.xml'):
            response = self.manager.list_subtrees()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['subtrees'][0]['id'], 'DockingTree')
        self.assertEqual(response.get_json()['subtrees'][0]['source_path'], 'subtrees.xml')

    def test_list_files_reports_xml_validity(self):
        (self.root / 'valid.xml').write_text(VALID_XML, encoding='utf-8')
        (self.root / 'invalid.xml').write_text('<broken>', encoding='utf-8')

        with self.app.test_request_context('/bt/files'):
            response = self.manager.list_files()
        files = {entry['path']: entry for entry in response.get_json()['files']}
        self.assertTrue(files['valid.xml']['valid'])
        self.assertFalse(files['invalid.xml']['valid'])

    def test_configure_and_list_routes_use_json_contract(self):
        other_root = self.root / 'other'
        other_root.mkdir()
        (other_root / 'main.xml').write_text(VALID_XML, encoding='utf-8')

        client = self.app.test_client()
        response = client.post('/bt/configure', json={'path': str(other_root)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Path(response.get_json()['root']), other_root.resolve())

        response = client.get('/bt/files')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['files'][0]['path'], 'main.xml')

    def test_validate_route_returns_invalid_document_as_unprocessable(self):
        response = self.app.test_client().post('/bt/validate', json={'content': '<broken>'})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(response.get_json()['valid'])

    def test_github_route_rejects_non_github_url(self):
        response = self.app.test_client().post('/bt/github/pull', json={
            'url': 'https://example.com/owner/repository',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('GitHub', response.get_json()['error'])

    def test_github_route_rejects_invalid_overwrite_path(self):
        response = self.app.test_client().post('/bt/github/pull', json={
            'url': 'https://github.com/owner/repository',
            'overwrite': ['../main.xml'],
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('overwrite', response.get_json()['error'])

    def test_github_route_requires_configured_root(self):
        manager = BtFileManager()
        app = Flask(__name__)
        register_routes(app, '', manager)
        response = app.test_client().post('/bt/github/pull', json={
            'url': 'https://github.com/owner/repository',
        })
        self.assertEqual(response.status_code, 409)

    def test_pull_github_reports_conflicts_without_overwriting(self):
        (self.root / 'main.xml').write_text('local', encoding='utf-8')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('owner-repository-main/main.xml', 'remote')
            output.writestr('owner-repository-main/new.xml', VALID_XML)
        archive.seek(0)

        with patch('bt_file_manager.urllib.request.urlopen', return_value=FakeDownload(archive)):
            with self.app.test_request_context('/bt/github/pull', method='POST', json={
                'url': 'https://github.com/owner/repository',
            }):
                response = self.manager.pull_github()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['conflicts'], ['main.xml'])
        self.assertEqual(response.get_json()['copied'], 1)
        self.assertEqual((self.root / 'main.xml').read_text(encoding='utf-8'), 'local')
        self.assertTrue((self.root / 'new.xml').exists())

    def test_pull_github_overwrite_all_replaces_existing_files(self):
        (self.root / 'main.xml').write_text('local', encoding='utf-8')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('owner-repository-main/main.xml', 'remote')
        archive.seek(0)

        with patch('bt_file_manager.urllib.request.urlopen', return_value=FakeDownload(archive)):
            with self.app.test_request_context('/bt/github/pull', method='POST', json={
                'url': 'https://github.com/owner/repository', 'overwrite': True,
            }):
                response = self.manager.pull_github()

        self.assertEqual(response.get_json()['conflicts'], [])
        self.assertEqual((self.root / 'main.xml').read_text(encoding='utf-8'), 'remote')

    def test_pull_github_copies_only_xml_files_from_subdirectory(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('owner-repository-main/trees/main.xml', VALID_XML)
            output.writestr('owner-repository-main/trees/readme.txt', 'not a tree')
        archive.seek(0)

        with patch('bt_file_manager.urllib.request.urlopen', return_value=FakeDownload(archive)):
            with self.app.test_request_context('/bt/github/pull', method='POST', json={
                'url': 'https://github.com/owner/repository',
                'subdirectory': 'trees',
            }):
                response = self.manager.pull_github()

        self.assertEqual(response.get_json()['copied'], 1)
        self.assertTrue((self.root / 'main.xml').exists())
        self.assertFalse((self.root / 'readme.txt').exists())

    def test_pull_github_overwrites_only_selected_conflict(self):
        (self.root / 'main.xml').write_text('local-main', encoding='utf-8')
        (self.root / 'other.xml').write_text('local-other', encoding='utf-8')
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('owner-repository-main/main.xml', 'remote-main')
            output.writestr('owner-repository-main/other.xml', 'remote-other')
        archive.seek(0)

        with patch('bt_file_manager.urllib.request.urlopen', return_value=FakeDownload(archive)):
            with self.app.test_request_context('/bt/github/pull', method='POST', json={
                'url': 'https://github.com/owner/repository', 'overwrite': ['main.xml'],
            }):
                response = self.manager.pull_github()

        self.assertEqual(response.get_json()['conflicts'], ['other.xml'])
        self.assertEqual((self.root / 'main.xml').read_text(encoding='utf-8'), 'remote-main')
        self.assertEqual((self.root / 'other.xml').read_text(encoding='utf-8'), 'local-other')

    def test_pull_github_rejects_archive_path_traversal(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('owner-repository-main/../../outside.xml', 'unsafe')
        archive.seek(0)

        with patch('bt_file_manager.urllib.request.urlopen', return_value=FakeDownload(archive)):
            with self.app.test_request_context('/bt/github/pull', method='POST', json={
                'url': 'https://github.com/owner/repository',
            }):
                response = self.manager.pull_github()

        _, status_code = self.unpack_response(response)
        self.assertEqual(status_code, 400)
        self.assertFalse((self.root.parent / 'outside.xml').exists())


if __name__ == '__main__':
    unittest.main()
