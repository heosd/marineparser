// <textarea is="text-log" id="log2" data-auto-scroll="false"></textarea>
// lll.appendLine('one');
// lll.clear();
// or just using the last element
// TextLog.Append('text');
// TextLog.Clear();
class TextLog extends HTMLTextAreaElement {
	constructor() {
		super();

		this.autoScroll = true;

		// -- just to easy of use!
		// -- setting last one instance to global log element
		TextLog.SetLogElement(this);
	}

	static get observedAttributes() {
		return ['data-auto-scroll'];
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if ('data-auto-scroll' === name) {
			if ('false' === newValue) {
				this.autoScroll = false;
			} else {
				this.autoScroll = true;
			}
		}
	}

	append(str) {
		this.value = this.value + str;

		if (this.autoScroll) {
			this.scrollToBottom();
		}
	}

	appendLine(str) {
		this.value = this.value + '\n' + str;

		if (this.autoScroll) {
			this.scrollToBottom();
		}

	}

	scrollToBottom() {
		this.scrollTop = this.scrollHeight;
	}

	clear() {
		this.value = '';
	}

	static LogElement = undefined;
	static LastMS = undefined;
	static SetLogElement(e) {
		TextLog.LogElement = e;
	}

	static Append(str) {
		if (TextLog.LogElement) {
			TextLog.LogElement.appendLine(str);
		}
	}

	static Time(str) {
		if (TextLog.LastMS) {
			const ms = new Date().getTime();
			const diff = ms - TextLog.LastMS;
			TextLog.Append(str + ' ' + diff + 'ms');
			TextLog.LastMS = ms;
		} else {
			TextLog.Append(str);
			TextLog.LastMS = new Date().getTime();
		}
	}

	static TimeNew() {
		TextLog.LastMS = new Date().getTime();
	}

	static Clear() {
		if (TextLog.LogElement) {
			TextLog.LogElement.clear();
		}
	}
}

customElements.define('text-log', TextLog, { extends: 'textarea' });