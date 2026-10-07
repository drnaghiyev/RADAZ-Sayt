import importlib.util
import io
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.parse
import zipfile
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, CTImageStorage, generate_uid
from pynetdicom import AE, evt
from pynetdicom.sop_class import Verification

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'integrations/clinic/bridge.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BridgeTest(unittest.TestCase):
    def test_c_store_durable_queue_and_http_delivery(self):
        uploads = []
        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                self.server.test.assertEqual(self.headers['Authorization'], 'Bearer fixture-secret')
                raw = self.rfile.read(int(self.headers['Content-Length']))
                metadata = json.loads(urllib.parse.unquote(self.headers['X-RADAZ-Study']))
                uploads.append((raw, metadata))
                self.send_response(200);self.end_headers();self.wfile.write(b'{"id":"RZ-fixture"}')
            def log_message(self, *args):
                pass
        with tempfile.TemporaryDirectory() as folder:
            http = HTTPServer(('127.0.0.1', 0), Receiver);http.test = self
            threading.Thread(target=http.serve_forever, daemon=True).start()
            config = {'endpoint': f'http://127.0.0.1:{http.server_port}/api/clinic-ingest/fixture', 'api_key': 'fixture-secret', 'enabled': True, 'ae_title':'RADAZ_TEST', 'source_ae_titles':['CT_TEST'], 'source_ips':['127.0.0.1'], 'spool_dir':folder}
            bridge = module.Bridge(config)
            receiver = AE(ae_title='RADAZ_TEST');receiver.add_supported_context(CTImageStorage, ExplicitVRLittleEndian);receiver.add_supported_context(Verification)
            scp = receiver.start_server(('127.0.0.1', 0), block=False, evt_handlers=[(evt.EVT_C_STORE, bridge.store), (evt.EVT_C_ECHO, bridge.echo)])
            try:
                ds = Dataset();ds.file_meta=FileMetaDataset();ds.file_meta.TransferSyntaxUID=ExplicitVRLittleEndian
                ds.SOPClassUID=CTImageStorage;ds.SOPInstanceUID=generate_uid();ds.StudyInstanceUID=generate_uid();ds.SeriesInstanceUID=generate_uid();ds.PatientName='Synthetic^Fixture';ds.PatientID='TEST';ds.Modality='CT';ds.Rows=2;ds.Columns=2;ds.SamplesPerPixel=1;ds.PhotometricInterpretation='MONOCHROME2';ds.BitsAllocated=16;ds.BitsStored=16;ds.HighBit=15;ds.PixelRepresentation=0;ds.PixelData=b'\0'*8
                sender=AE(ae_title='CT_TEST');sender.add_requested_context(CTImageStorage,ExplicitVRLittleEndian);sender.add_requested_context(Verification)
                assoc=sender.associate('127.0.0.1',scp.server_address[1],ae_title='RADAZ_TEST');self.assertTrue(assoc.is_established)
                self.assertEqual(assoc.send_c_echo().Status,0);self.assertEqual(assoc.send_c_store(ds).Status,0);assoc.release()
                self.assertEqual(len(list(Path(folder).rglob('*.dcm'))),1)
                module.Bridge(config).flush(force=True)
                self.assertEqual(len(uploads),1);self.assertEqual(uploads[0][1]['instances'],1)
                with zipfile.ZipFile(io.BytesIO(uploads[0][0])) as archive:self.assertEqual(archive.read(archive.namelist()[0])[128:132],b'DICM')
                module.Bridge(config).flush(force=True);self.assertEqual(len(uploads),1,'restart must not resend acknowledged study')
            finally:
                scp.shutdown();http.shutdown();http.server_close()

if __name__ == '__main__':
    unittest.main()
