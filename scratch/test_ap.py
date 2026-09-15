import urllib.request
import json

url = "http://127.0.0.1:8000/api/officer/dashboard?state=ANDHRA%20PRADESH&limit=3"
res = urllib.request.urlopen(url)
data = json.loads(res.read().decode('utf-8'))

print("Total works:", data['summary']['total_works'])
print("Constituencies count:", len(data['available']['constituencies']))
print("Constituencies:", data['available']['constituencies'])
