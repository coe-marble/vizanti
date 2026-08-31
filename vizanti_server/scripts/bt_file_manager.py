import hashlib
import os
import tempfile
import xml.etree.ElementTree as ElementTree
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


def register_routes(app, base_url, bt_file_manager):
    app.add_url_rule(base_url + '/bt/configure', 'configure_bt_root', bt_file_manager.configure_root, methods=['POST'])
    app.add_url_rule(base_url + '/bt/files', 'list_bt_files', bt_file_manager.list_files)
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'get_bt_file', bt_file_manager.get_file)
    app.add_url_rule(base_url + '/bt/file', 'create_bt_file', bt_file_manager.create_file, methods=['POST'])
    app.add_url_rule(base_url + '/bt/subtrees', 'list_bt_subtrees', bt_file_manager.list_subtrees)
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'save_bt_file', bt_file_manager.save_file, methods=['PUT'])
    app.add_url_rule(base_url + '/bt/file/<path:relative_path>', 'delete_bt_file', bt_file_manager.delete_file, methods=['DELETE'])
    app.add_url_rule(base_url + '/bt/validate', 'validate_bt_file', bt_file_manager.validate_file, methods=['POST'])
