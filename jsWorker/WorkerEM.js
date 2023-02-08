importScripts('../js/ParserA.js');
importScripts('../js/ParserEM.js');

let queue = [];
let flagWorkingNow = false;

function appendLog(str) {
	postMessage({type: 'log', data: str});
}

function appendMain(str) {
	postMessage({type: 'main', data: str});
}

function postResult(data) {
	postMessage({type: 'result', data: data});
}

function queueWork(src) {
	queue.push(src);
}

function popexecWork() {
	const ab = queue.shift();

	if(!ab) {
		flagWorkingNow = false;
		return;
	}

	flagWorkingNow = true;

	const src = ParserEM.ParserTest.LoadArrayBuffer(ab);

	const context = new ParserEM.ParserContext();
	appendLog(`load to context parser`);
	context.load(src.dataView, src.sectionTable, src.littleEndian);
	const d1 = new Date().getTime();
	appendLog(`trying to parse Position`);

	context.parsePosition();
	const d2 = new Date().getTime();
	appendLog(`done to parse Position ${d2 - d1}ms`);

	appendLog(`trying to parse XYZ`);
	context.parseXYZ();
	const d3 = new Date().getTime();
	appendLog(`done to parse XYZ took ${d3 - d2}ms`);

	appendLog(`trying to calculate approximate xyz`);
	context.calcPositionWithXYZ();
		
	const d4 = new Date().getTime();
	appendLog(`done calculating took ${d4 - d3}ms`);
	// context.clearMemory();

	flagWorkingNow = false;
	postResult(context);

	setTimeout(() => {
		popexecWork()
	}, 1);
}

onmessage = function(e) {
	const src = e.data;

	queueWork(src);

	if(!flagWorkingNow) {
		popexecWork();
	}

}