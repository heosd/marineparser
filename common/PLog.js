class PLog extends HTMLDivElement {
	constructor(ds) {
		super();

		// -- just to easy of use!
		// -- setting last one instance to global log element
		PLog.SetLogElement(this);
	}

	append(str) {
		const e = document.createElement('p');
		e.textContent = str;
		this.appendChild(e);
	}

	clear() {
		this.innerHTML = '';
	}

	static LogElement = undefined;
	static SetLogElement(e) {
		PLog.LogElement = e;
	}

	static Append(str) {
		if (PLog.LogElement) {
			PLog.LogElement.append(str);
		}
	}

	static Clear() {
		if (PLog.LogElement) {
			PLog.LogElement.clear();
		}
	}
}

customElements.define('p-log', PLog, { extends: 'div' });