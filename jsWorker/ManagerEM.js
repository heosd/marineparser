// -- Just single instance
const ManagerEM = (() => {
	const PATH_WORKER = '/jsWorker/WorkerEM.js';
	let ParserWorker = undefined;
	let Context = undefined;
	let fnOnMessage = undefined;

	function initWorker() {
		if (ParserWorker) {
			// -- terminate??
		} else {
			ParserWorker = new Worker(PATH_WORKER);
			ParserWorker.onmessage = (e) => {
				const msg = e.data;

				if(fnOnMessage) {
					fnOnMessage(e);
				}
				
				/*
				if ('log' === msg.type) {
					TextLog.Append(msg.data);
				} else if ('main' === msg.type) {
					appendMain(msg.data);
				} else if ('result' === msg.type) {
					const context = e.data.data;
					Context = context;

					if(fnOnMessage) {
						fnOnMessage(Context);
					}
				}
				*/
			}
		}
	}
	initWorker();

	function queueWork(ab) {
		ParserWorker.postMessage(ab);
	}

	function setOnMessage(fn) {
		fnOnMessage = fn;
	}

	const resultObj = {
		queueWork: queueWork,
		getContext: () => Context,
		setOnMessage: setOnMessage,
	}

	return resultObj;
})();

