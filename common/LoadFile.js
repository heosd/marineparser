// http://127.0.0.1:8080/raw.all
async function fetchFileFromURL(url, fnLog) {
	if(!fnLog) {
		fnLog = () => {}
	}

	fnLog(`trying to fetch from : ${url}`);
	const r = await fetch(url);

	fnLog(`fetched status : ${r.statusText}`);

	let resultArrayBuffer = undefined;
	if (url.match(/\.gz$/i)) {
		fnLog(`file gz type, load file`);
		const blob = await r.blob();
		fnLog(`file gz type, decompressing`);
		const ds = new DecompressionStream('gzip');
		const decompressedStream = blob.stream().pipeThrough(ds);
		const ab = await new Response(decompressedStream).arrayBuffer();
		resultArrayBuffer = ab;
	} else if (url.match(/\.all$/i) || url.match(/\.mb58$/i)) {
		const ab = await r.arrayBuffer();
		resultArrayBuffer = ab;
	} else if (url.match(/\.sgy$/i)) {
		const ab = await r.arrayBuffer();
		resultArrayBuffer = ab;
	}

	if (resultArrayBuffer) {
		fnLog(`trying to load from ArrayBuffer ${resultArrayBuffer.byteLength.toLocaleString('en')} bytes`);
		return resultArrayBuffer;
		// loadArrayBuffer(resultArrayBuffer);
	} else {
		fnLog(`invalid url or invalid file type, try another url`);
	}
}