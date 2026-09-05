import hashlib
import json
import os
import shutil
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ElementTree
import zipfile
from pathlib import Path

from flask import jsonify, request


class BtFileManager:
    DEFAULT_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4" main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence />
  </BehaviorTree>
</root>
'''

    def __init__(self, xml_root=''):
        self.xml_root = None
        if xml_root:
            self.set_root(xml_root)

    def set_root(self, root):
        candidate = Path(os.path.expanduser(root)).resolve()
        if not candidate.is_dir():
            return False
        self.xml_root = candidate
        return True

    def resolve_file(self, relative_path):
        if self.xml_root is None:
            raise ValueError('BT XML root is not configured.')
        if not relative_path or os.path.isabs(relative_path):
            raise ValueError('A relative XML path is required.')

        target = (self.xml_root / relative_path).resolve()
        if self.xml_root not in target.parents or target.suffix.lower() != '.xml':
            raise ValueError('XML path is outside the configured root.')
        return target

    @staticmethod
    def validate_xml(content):
        if not isinstance(content, str):
            return 'XML content is required.'
        try:
            root = ElementTree.fromstring(content)
        except ElementTree.ParseError as error:
            return str(error)
        if root.tag != 'root':
            return 'The XML document root must be <root>.'
        return None

    def configure_root(self):
        payload = request.get_json(silent=True) or {}
        root = payload.get('path', '')
        if not isinstance(root, str) or not root.strip():
            return jsonify(error='An XML folder path is required.'), 400
        if not self.set_root(root):
            return jsonify(error='The XML folder does not exist or is not a directory.'), 400
        return jsonify(root=str(self.xml_root))

    def pull_github(self):
        payload = request.get_json(silent=True) or {}
        repository_url = payload.get('url', '')
        reference = payload.get('ref', 'main')
        subdirectory = payload.get('subdirectory', '')
        overwrite = payload.get('overwrite', False)
        if not all(isinstance(value, str) for value in (repository_url, reference, subdirectory)):
            return jsonify(error='GitHub URL, branch/tag, and subdirectory must be strings.'), 400
        if not isinstance(overwrite, (bool, list)):
            return jsonify(error='Overwrite must be a boolean or a list of file paths.'), 400
        overwrite_paths = set(overwrite if isinstance(overwrite, list) else [])
        if any(not isinstance(path, str) or not path or Path(path).is_absolute() or '..' in Path(path).parts for path in overwrite_paths):
            return jsonify(error='The overwrite file list contains an invalid path.'), 400

        parsed_url = urllib.parse.urlparse(repository_url.strip())
        if parsed_url.scheme != 'https' or parsed_url.netloc.lower() not in ('github.com', 'www.github.com'):
            return jsonify(error='Only HTTPS GitHub repository URLs are supported.'), 400
        repository_parts = [part for part in parsed_url.path.strip('/').split('/') if part]
        if len(repository_parts) != 2:
            return jsonify(error='Use a repository URL such as https://github.com/owner/repository.'), 400

        owner, repository = repository_parts
        repository = repository.removesuffix('.git')
        reference = reference.strip() or 'main'
        subdirectory = subdirectory.strip().strip('/')
        if subdirectory and any(part in ('', '.', '..') for part in subdirectory.split('/')):
            return jsonify(error='The repository subdirectory is invalid.'), 400
        if self.xml_root is None:
            return jsonify(error='The behavior tree folder is not configured.'), 409

        archive_url = 'https://api.github.com/repos/{}/{}/zipball/{}'.format(
            urllib.parse.quote(owner, safe=''),
            urllib.parse.quote(repository, safe=''),
            urllib.parse.quote(reference, safe=''),
        )
        try:
            with tempfile.TemporaryDirectory(prefix='vizanti_bt_pull_') as staging:
                archive_path = Path(staging) / 'repository.zip'
                request_headers = {'User-Agent': 'Vizanti-BT-Manager'}
                download_request = urllib.request.Request(archive_url, headers=request_headers)
                with urllib.request.urlopen(download_request) as response, archive_path.open('wb') as output:
                    shutil.copyfileobj(response, output)
                extract_path = Path(staging) / 'repository'
                with zipfile.ZipFile(archive_path) as archive:
                    for member in archive.infolist():
                        member_path = Path(member.filename)
                        if member_path.is_absolute() or '..' in member_path.parts:
                            raise ValueError('The GitHub archive contains an unsafe path.')
                    archive.extractall(extract_path)

                roots = [path for path in extract_path.iterdir() if path.is_dir()]
                if len(roots) != 1:
                    raise ValueError('The GitHub archive has an unexpected structure.')
                source_root = roots[0] / subdirectory if subdirectory else roots[0]
                if not source_root.is_dir():
                    raise ValueError('The repository subdirectory was not found.')

                copied = 0
                conflicts = []
                for source_file in source_root.rglob('*.xml'):
                    relative_path = source_file.relative_to(source_root)
                    destination_file = self.xml_root / relative_path
                    destination_file.parent.mkdir(parents=True, exist_ok=True)
                    relative_name = relative_path.as_posix()
                    should_overwrite = overwrite is True or relative_name in overwrite_paths
                    if destination_file.exists() and not should_overwrite:
                        conflicts.append(relative_name)
                    else:
                        shutil.copy2(source_file, destination_file)
                        copied += 1
                return jsonify(root=str(self.xml_root), copied=copied, conflicts=sorted(conflicts))
        except (OSError, urllib.error.URLError, zipfile.BadZipFile, ValueError) as error:
            return jsonify(error=f'Unable to pull GitHub behavior trees: {error}'), 400

    def list_files(self):
        if self.xml_root is None:
            return jsonify(error='BT XML root is not configured.'), 409

        files = []
        for path in sorted(self.xml_root.rglob('*.xml')):
            resolved = path.resolve()
            if self.xml_root not in resolved.parents or not resolved.is_file():
                continue
            stat = resolved.stat()
            try:
                validation_error = self.validate_xml(resolved.read_text(encoding='utf-8'))
            except (OSError, UnicodeDecodeError) as error:
                validation_error = str(error)
            files.append({
                'path': resolved.relative_to(self.xml_root).as_posix(),
                'mtime_ns': stat.st_mtime_ns,
                'size': stat.st_size,
                'valid': validation_error is None,
                'validation_error': validation_error,
            })
        return jsonify(root=str(self.xml_root), files=files)

    def get_file(self, relative_path):
        try:
            path = self.resolve_file(relative_path)
            if not path.is_file():
                return jsonify(error='XML file was not found.'), 404
            content = path.read_text(encoding='utf-8')
            return jsonify(
                path=path.relative_to(self.xml_root).as_posix(),
                content=content,
                revision=hashlib.sha256(content.encode('utf-8')).hexdigest(),
            )
        except (OSError, UnicodeDecodeError, ValueError) as error:
            return jsonify(error=str(error)), 400

    def create_file(self):
        payload = request.get_json(silent=True) or {}
        relative_path = payload.get('path', '')
        if not isinstance(relative_path, str) or not relative_path.strip():
            return jsonify(error='An XML filename is required.'), 400

        try:
            path = self.resolve_file(relative_path)
            if path.exists():
                return jsonify(error='An XML file with that name already exists.'), 409
            if not path.parent.is_dir():
                return jsonify(error='The target folder does not exist.'), 400
            with path.open('x', encoding='utf-8') as output:
                output.write(self.DEFAULT_XML)
            content = path.read_text(encoding='utf-8')
            return jsonify(
                path=path.relative_to(self.xml_root).as_posix(),
                content=content,
                revision=hashlib.sha256(content.encode('utf-8')).hexdigest(),
            ), 201
        except FileExistsError:
            return jsonify(error='An XML file with that name already exists.'), 409
        except (OSError, UnicodeDecodeError, ValueError) as error:
            return jsonify(error=str(error)), 400

    def list_subtrees(self):
        selected_path = request.args.get('path', '')
        try:
            selected = self.resolve_file(selected_path)
            if not selected.is_file():
                return jsonify(error='XML file was not found.'), 404

            subtrees = []
            for path in sorted(self.xml_root.rglob('*.xml')):
                resolved = path.resolve()
                if resolved == selected or self.xml_root not in resolved.parents:
                    continue
                try:
                    document_root = ElementTree.parse(resolved).getroot()
                except (ElementTree.ParseError, OSError, UnicodeDecodeError):
                    continue
                for behavior_tree in document_root.findall('BehaviorTree'):
                    tree_id = behavior_tree.get('ID')
                    if not tree_id:
                        continue
                    subtrees.append({
                        'id': tree_id,
                        'source_path': resolved.relative_to(self.xml_root).as_posix(),
                        'include_path': os.path.relpath(resolved, selected.parent).replace(os.sep, '/'),
                    })
            return jsonify(subtrees=subtrees)
        except (OSError, ValueError) as error:
            return jsonify(error=str(error)), 400

    def save_file(self, relative_path):
        payload = request.get_json(silent=True) or {}
        content = payload.get('content')
        revision = payload.get('revision')
        if not isinstance(content, str):
            return jsonify(error='XML content is required.'), 400
        if len(content.encode('utf-8')) > 2 * 1024 * 1024:
            return jsonify(error='XML files are limited to 2 MiB.'), 413

        try:
            path = self.resolve_file(relative_path)
            if not path.is_file():
                return jsonify(error='XML file was not found.'), 404
            current = path.read_text(encoding='utf-8')
            current_revision = hashlib.sha256(current.encode('utf-8')).hexdigest()
            if revision != current_revision:
                return jsonify(error='The file changed on disk. Reload before saving.'), 409

            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as temporary:
                temporary.write(content)
                temporary_path = temporary.name
            os.replace(temporary_path, path)
            return jsonify(revision=hashlib.sha256(content.encode('utf-8')).hexdigest())
        except (OSError, UnicodeDecodeError, ValueError) as error:
            return jsonify(error=str(error)), 400

    def delete_file(self, relative_path):
        try:
            path = self.resolve_file(relative_path)
            if not path.is_file():
                return jsonify(error='XML file was not found.'), 404
            path.unlink()
            return jsonify(path=relative_path)
        except OSError as error:
            return jsonify(error=str(error)), 400
        except ValueError as error:
            return jsonify(error=str(error)), 400

    def validate_file(self):
        payload = request.get_json(silent=True) or {}
        error = self.validate_xml(payload.get('content'))
        if error:
            return jsonify(valid=False, error=error), 422
        return jsonify(valid=True)

    def get_catalog(self, catalog_path):
        try:
            catalog = json.loads(Path(catalog_path).read_text(encoding='utf-8'))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            return jsonify(error=f'Unable to load the bundled node catalog: {error}'), 500
        if not isinstance(catalog, dict) or not isinstance(catalog.get('nodes'), list):
            return jsonify(error='The bundled node catalog has an invalid format.'), 500
        return jsonify(catalog)


def register_routes(app, base_url, bt_file_manager):
    catalog_path = Path(app.static_folder) / 'templates' / 'btmanager' / 'nav2_catalog.json'
    app.add_url_rule(base_url + '/bt/catalog', 'get_bt_catalog', lambda: bt_file_manager.get_catalog(catalog_path))
    app.add_url_rule(base_url + '/bt/configure', 'configure_bt_root', bt_file_manager.configure_root, methods=['POST'])
    app.add_url_rule(base_url + '/bt/github/pull', 'pull_bt_github', bt_file_manager.pull_github, methods=['POST'])
    app.add_url_rule(base_url + '/bt/files', 'list_bt_files', bt_file_manager.list_files)
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'get_bt_file', bt_file_manager.get_file)
    app.add_url_rule(base_url + '/bt/file', 'create_bt_file', bt_file_manager.create_file, methods=['POST'])
    app.add_url_rule(base_url + '/bt/subtrees', 'list_bt_subtrees', bt_file_manager.list_subtrees)
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'save_bt_file', bt_file_manager.save_file, methods=['PUT'])
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'delete_bt_file', bt_file_manager.delete_file, methods=['DELETE'])
    app.add_url_rule(base_url + '/bt/validate', 'validate_bt_file', bt_file_manager.validate_file, methods=['POST'])
