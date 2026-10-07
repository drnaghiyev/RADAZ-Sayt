"""Durable DICOM C-STORE receiver and scoped HTTPS sender for RADAZ clinics."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pynetdicom import AE, evt, AllStoragePresentationContexts
from pynetdicom.sop_class import Verification
from pynetdicom import ALL_TRANSFER_SYNTAXES

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirect rejected: connection keys stay on the configured endpoint.')

class Bridge:
    def __init__(self, config):
        self.config = config
        parsed = urllib.parse.urlparse(config['endpoint'])
        if not (parsed.scheme == 'https' or parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost', '::1')):
            raise ValueError('Use HTTPS or loopback HTTP for the RADAZ endpoint.')
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Endpoint must not contain credentials, query or fragment.')
        if not config.get('enabled') or not config.get('api_key') or not config.get('source_ae_titles'):
            raise ValueError('Enable the connection and configure allowed source AE Titles.')
        self.spool = Path(config.get('spool_dir', './spool')).resolve()
        self.spool.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.http = urllib.request.build_opener(NoRedirect)

    def request(self, suffix='', data=None, metadata=None):
        headers = {'Authorization': 'Bearer ' + self.config['api_key']}
        if metadata:
            headers.update({'Content-Type': 'application/zip', 'X-RADAZ-Study': urllib.parse.quote(json.dumps(metadata, ensure_ascii=False))})
        request = urllib.request.Request(self.config['endpoint'].rstrip('/') + suffix, data=data, headers=headers)
        with self.http.open(request, timeout=120) as response:
            return json.load(response)

    def allowed(self, event):
        ae = str(event.assoc.requestor.ae_title).strip()
        ip = event.assoc.requestor.address
        return ae in self.config['source_ae_titles'] and (not self.config.get('source_ips') or ip in self.config['source_ips'])

    def echo(self, event):
        return 0x0000 if self.allowed(event) else 0xA700

    def store(self, event):
        if not self.allowed(event):
            return 0xA700
        try:
            ds = event.dataset
            study, instance = str(ds.StudyInstanceUID), str(ds.SOPInstanceUID)
            if not all(re.fullmatch(r'[0-9.]{1,64}', v) for v in (study, instance)):
                return 0xC210
            folder = self.spool / hashlib.sha256(study.encode()).hexdigest()
            filename = hashlib.sha256(instance.encode()).hexdigest() + '.dcm'
            with self.lock:
                folder.mkdir(exist_ok=True)
                target = folder / filename
                raw = event.encoded_dataset()
                if target.exists() and hashlib.sha256(target.read_bytes()).digest() == hashlib.sha256(raw).digest():
                    return 0x0000
                temporary = target.with_suffix('.tmp')
                with temporary.open('wb') as f:
                    f.write(raw)
                    f.flush()
                    os.fsync(f.fileno())
                temporary.replace(target)
                meta = {'study_uid': study, 'patient_name': str(getattr(ds, 'PatientName', 'Unknown')), 'patient_id': str(getattr(ds, 'PatientID', '')), 'modality': str(getattr(ds, 'Modality', '')), 'description': str(getattr(ds, 'StudyDescription', ''))}
                temp_meta = folder / 'metadata.tmp'
                temp_meta.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
                temp_meta.replace(folder / 'metadata.json')
            # Success means durably queued locally. Remote acknowledgement is recorded separately.
            return 0x0000
        except Exception as error:
            print('C-STORE could not be queued:', type(error).__name__, flush=True)
            return 0xA700

    def flush(self, force=False):
        for folder in self.spool.iterdir():
            if not folder.is_dir() or not (folder / 'metadata.json').exists():
                continue
            try:
                with self.lock:
                    files = sorted(folder.glob('*.dcm'))
                    if not files or not force and time.time() - max(f.stat().st_mtime for f in files) < max(5, int(self.config.get('idle_seconds', 120))):
                        continue
                    signature = hashlib.sha256()
                    for f in files:
                        signature.update(f.name.encode())
                        signature.update(hashlib.sha256(f.read_bytes()).digest())
                    manifest = signature.hexdigest()
                    sent = folder / 'sent.json'
                    if sent.exists() and json.loads(sent.read_text())['manifest'] == manifest:
                        continue
                    output = io.BytesIO()
                    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
                        for f in files:
                            archive.write(f, f.name)
                    payload = output.getvalue()
                    if len(payload) > 64 * 1024 * 1024:
                        raise ValueError('Study ZIP exceeds 64 MB bridge limit; use the website upload (256 MB). Local files retained.')
                    meta = json.loads((folder / 'metadata.json').read_text(encoding='utf-8'))
                    meta.update(instances=len(files), manifest=manifest)
                result = self.request(data=payload, metadata=meta)
                with self.lock:
                    temporary = folder / 'sent.tmp'
                    temporary.write_text(json.dumps({'manifest': manifest, 'case_id': result['id'], 'sent_at': time.time()}))
                    temporary.replace(sent)
                print('Study delivered:', result['id'], 'instances:', len(files), flush=True)
            except urllib.error.HTTPError as error:
                print('Delivery pending; HTTP', error.code, '- local files retained.', flush=True)
            except Exception as error:
                print('Delivery pending:', type(error).__name__, str(error)[:160], flush=True)

    def run(self):
        ae = AE(ae_title=self.config['ae_title'])
        ae.require_called_aet = True
        ae.require_calling_aet = self.config['source_ae_titles']
        for context in AllStoragePresentationContexts:
            ae.add_supported_context(context.abstract_syntax, ALL_TRANSFER_SYNTAXES)
        ae.add_supported_context(Verification)
        server = ae.start_server((self.config.get('listen_host', '127.0.0.1'), int(self.config.get('dicom_port', 11112))), block=False, evt_handlers=[(evt.EVT_C_STORE, self.store), (evt.EVT_C_ECHO, self.echo)])
        print('RADAZ clinic receiver ready; AE:', self.config['ae_title'], 'port:', self.config['dicom_port'], flush=True)
        try:
            while not self.stop.wait(10):
                self.flush()
        finally:
            server.shutdown()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--flush', action='store_true')
    args = parser.parse_args()
    bridge = Bridge(json.loads(Path(args.config).read_text(encoding='utf-8-sig')))
    if args.check:
        print('RADAZ connection:', 'OK' if bridge.request('/health').get('ok') else 'FAILED')
    elif args.flush:
        bridge.flush(force=True)
    else:
        bridge.run()
