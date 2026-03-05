
import http, { IncomingMessage } from 'http';

const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res: IncomingMessage) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
        console.log(`CHUNK: ${JSON.stringify(chunk)}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(JSON.stringify({
    model: 'gemma3:4b',
    messages: [{ role: 'user', content: 'Say hi' }],
    stream: true
}));
req.end();
