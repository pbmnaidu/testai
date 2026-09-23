import urllib.request
import ssl
import time

ctx = ssl._create_unverified_context()
url = 'https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData'
data = b'{"combo":"0,0,0,2","key":"Works Completed"}'
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})

t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
        print('Status:', resp.status, 'Time:', round(time.time() - t0, 2))
        print('Bytes:', len(resp.read()))
except Exception as e:
    print('Failed in', round(time.time() - t0, 2), 's with error:', type(e).__name__, e)
