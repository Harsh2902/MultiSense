
async function debugEmbedding() {
    const model = 'gemma3:4b';
    const prompt = 'Test embedding';

    console.log(`Testing embedding with model: ${model}`);

    try {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Error ${response.status}: ${response.statusText}`);
            console.error('Response Body:', text);
        } else {
            const data = await response.json();
            console.log('Success!');
            console.log('Embedding length:', data.embedding?.length);
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

debugEmbedding();
