// just to help use of SVG 
SVGEXX = (() => {
	class SVGParent {
		#e = undefined;

		constructor() {
		}

		set e(e) {
			this.#e = e;
		}

		get e() {
			return this.#e;
		}

		static NS = 'http://www.w3.org/2000/svg';

		static createFrom(e) {
			// TODO craete SVGPath with element
		}

		prepend(args) {
			for (let i = 0; i < arguments.length; i++) {
				const node = arguments[i];
				if (this.#e.firstChild) {
					this.#e.insertBefore(node.e, this.#e.firstChild);
				} else {
					this.#e.appendChild(node.e);
				}
			}
		}

		append(args) {
			for (let i = 0; i < arguments.length; i++) {
				const node = arguments[i];
				this.#e.appendChild(node.e);
			}
		}

		setAttributes(attrs) {
			for (const [k, v] of Object.entries(attrs)) {
				this.#e.setAttributeNS(null, k, v);
			}
		}

		set(k, v) {
			this.#e.setAttributeNS(null, k, v);
		}

		// -- derive
		createElement() { }
		update() { }
	}

	// -- SVG
	class SVG extends SVGParent {
		// -- defaults
		#defaults = {};

		constructor(w, h) {
			super();

			this.#defaults.width = w;
			this.#defaults.height = h;
			this.createElement();
		}

		createElement() {
			this.e = document.createElementNS(SVGParent.NS, 'svg');
			this.setAttributes(this.#defaults);
		}
	}

	// SVGGroup
	class SVGGroup extends SVGParent {
		// -- defaults
		#defaults = {};

		constructor() {
			super();

			this.createElement();
		}

		createElement() {
			this.e = document.createElementNS(SVGParent.NS, 'g');
			this.setAttributes(this.#defaults);
		}
	}

	// -- SVGPath
	class SVGPath extends SVGParent {
		#d = [];
		#isClosed = false;
		#lastPos = undefined;

		// -- defaults
		#defaults = {
			"stroke-width": 1,
			fill: 'none',
			stroke: 'black'
		}

		constructor() {
			super();
			this.createElement();

			if (0 < arguments.length) {
				this.setPath(arguments[0]);
			}
		}

		setPath(positions) {
			positions.forEach(d => {
				this.add(d[0], d[1]);
			});
		}

		add(x, y) {
			if (this.#lastPos && (this.#lastPos[0] === x && this.#lastPos[1] === y)) {
				// -- ignore
				return;
			}

			if (0 === this.#d.length) {
				this.#d.push('M ' + x + ' ' + y);
			} else {
				this.#d.push('L ' + x + ' ' + y);
			}

			this.#lastPos = [x, y];

			this.updateD();
		}

		set isClosed(isClosed) {
			this.#isClosed = isClosed;

			this.updateD();
		}

		get isClosed() {
			return this.#isClosed;
		}

		get d() {
			return this.#d.join(' ');
		}

		set stroke(stroke) {
			this.e.setAttributeNS(null, 'stroke', stroke);
		}

		set fill(fill) {
			this.e.setAttributeNS(null, 'fill', fill);
		}

		set width(width) {
			this.e.setAttributeNS(null, 'stroke-width', width);
		}

		createElement() {
			this.e = document.createElementNS(SVGParent.NS, 'path');
			this.setAttributes(this.#defaults);
		}

		updateD() {
			let strD = this.d;
			if (true === this.#isClosed) {
				strD = strD + ' Z';
			}

			this.e.setAttributeNS(null, 'd', strD);
		}
	}

	// -- Circle
	class SVGCircle extends SVGParent {
		// -- defaults
		#defaults = {
			r: 5,
			fill: 'black'
		};

		constructor(x, y, r) {
			super();

			!isNaN(x) && (this.#defaults.cx = x);
			!isNaN(y) && (this.#defaults.cy = y);
			!isNaN(r) && (this.#defaults.r = r);

			this.createElement();
		}

		set x(x) {
			this.set('cx', x);
		}

		set y(y) {
			this.set('cy', y);
		}

		set r(r) {
			this.set('r', r);
		}

		set fill(color) {
			this.set('fill', color);
		}

		createElement() {
			this.e = document.createElementNS(SVGParent.NS, 'circle');
			this.setAttributes(this.#defaults);
		}
	}

	// -- Text
	class SVGText extends SVGParent {
		// -- defaults
		#defaults = {};
		#defaultText = '';

		constructor(x, y, text) {
			super();

			!isNaN(x) && (this.#defaults.x = x);
			!isNaN(y) && (this.#defaults.y = y);

			this.#defaultText = text;

			this.createElement();
		}

		set x(x) {
			this.set('x', x);
		}

		set y(y) {
			this.set('y', y);
		}

		set dx(v) {
			this.set('dx', v);
		}

		set dy(v) {
			this.set('dy', v);
		}

		set rotate(v) {
			this.set('rotate', v);
		}

		set text(text) {
			this.e.textContent = text;
		}

		createElement() {
			this.e = document.createElementNS(SVGParent.NS, 'text');
			this.setAttributes(this.#defaults);
			this.text = this.#defaultText;
		}
	}

	return {
		SVG: SVG,
		Group: SVGGroup,
		Path: SVGPath,
		Circle: SVGCircle,
		Text: SVGText,

		create: (w, h) => new SVG(w, h),
		createGroup: () => new SVGGroup(),
		createPath: (positions) => new SVGPath(positions),
		createCircle: (x, y, r) => new SVGCircle(x, y, r),
		createText: (x, y, text) => new SVGText(x, y, text),
	}
})();


SVGE = (() => {
	NS = 'http://www.w3.org/2000/svg';

	function create(name, attrs, attrs2) {
		const e = document.createElementNS(NS, name);
		if (attrs) {
			sets(e, attrs);
		}

		if (attrs2) {
			sets(e, attrs2);
		}

		return e;
	}

	function sets(e, attrs) {
		for (const [k, v] of Object.entries(attrs)) {
			if ('text' === k) {
				e.textContent = v;
			} else {
				e.setAttributeNS(null, k, v);
			}
		}

		return e;
	}

	function set(e, k, v) {
		e.setAttributeNS(null, k, v);

		return e;
	}

	function get(e, k) {
		return e.getAttributeNS(null, k);
	}

	function gets(e, ks) {
		const r = {};
		ks.forEach(k => r[k] = e.getAttributeNS(null, k));
		return r;
	}

	function text(e, text) {
		e.textContent = text;
		return e;
	}

	function path() {
		const _path = [];
		let lastPath = undefined;

		const add = (x, y) => {
			if (lastPath && lastPath[0] === x && lastPath[1] === y) {
				return;
			}

			_path.push([x, y]);
			lastPath = [x, y];
		}

		const get = (isClosed = false) => {
			const f = _path[0];
			let str = `M ${f[0]} ${f[1]}`;

			for (let i = 1; i < _path.length; i++) {
				const item = _path[i];
				str = str + ` L ${item[0]} ${item[1]}`;
			}

			if (isClosed) {
				str = str + ' Z';
			}

			return str;
		}

		const create = (isClosed) => {
			const e = document.createElementNS(NS, 'path');
			e.setAttributeNS(null, 'd', get(isClosed));
			e.setAttributeNS(null, 'stroke-width', 1);
			e.setAttributeNS(null, 'fill', 'none');
			e.setAttributeNS(null, 'stroke', 'black');

			return e;
		}

		return {
			add: add,
			get: get,
			create: create,
		}
	}

	function getXY(e) {
		/*
		if('circle' === e.tagName) {
			return [Number(e.getAttributeNS(null, 'cx')), Number(e.getAttributeNS(null, 'cy'))];
		} else {
			return [Number(e.getAttributeNS(null, 'x')), Number(e.getAttributeNS(null, 'y'))];
		}
		*/

		if ('circle' === e.tagName) {
			return { cx: Number(e.getAttributeNS(null, 'cx')), cy: Number(e.getAttributeNS(null, 'cy')) };
		} else {
			return { x: Number(e.getAttributeNS(null, 'x')), y: Number(e.getAttributeNS(null, 'y')) };
		}
	}

	/**
	 * tickPlus([0, 6000], 1000);
	 */
	function tickPlus(domain, plus) {
		const ticksArray = [];
		for (let num = domain[0]; num <= domain[1]; num = num + plus) {
			ticksArray.push(num);
		}

		return ticksArray;
	}

	/**
	 * tickRange([0, 6000], 6);
	 */
	function tickRange(domain, tickCount) {
		let one = Math.round((Math.abs(domain[1] - domain[0]) / tickCount));
		if (0 === one) {
			one = 0.5;
		}

		return tickPlus(domain, one);
	}

	// -- can be duplicated but for sure
	const scaleLinear = function (domain, range) {
		return (v) => {
			return range[0] + (range[1] - range[0]) * ((v - domain[0]) / (domain[1] - domain[0]));
		}
	};


	function createSVGVertical(domain, range, scale, y, tickCount = 5, ticks) {
		if (!scale) {
			scale = scaleLinear(domain, range);
		}

		if (0 < tickCount && !ticks) {
			ticks = tickRange(domain, tickCount);
		}

		const result = [];
		ticks.forEach(tick => {
			const x = ~~scale(tick);
			const line = document.createElementNS(NS, 'line');
			line.setAttributeNS(null, 'y1', y[0]);
			line.setAttributeNS(null, 'y2', y[1]);
			line.setAttributeNS(null, 'x1', x);
			line.setAttributeNS(null, 'x2', x);
			line.setAttributeNS(null, 'stroke', 'gray');
			line.setAttributeNS(null, 'stroke-dasharray', '1, 2');

			const text = document.createElementNS(NS, 'text');
			text.textContent = tick;
			text.setAttributeNS(null, 'x', x);
			text.setAttributeNS(null, 'y', y[0] + 20);
			text.setAttributeNS(null, 'fill', 'gray');
			result.push(line);
			result.push(text);
		});

		return result;
	}

	function createSVGHorizontal(domain, range, scale, x, tickCount = 5, ticks) {
		if (!scale) {
			scale = scaleLinear(domain, range);
		}

		if (0 < tickCount && !ticks) {
			ticks = tickRange(domain, tickCount);
		}

		const result = [];

		ticks.forEach(tick => {
			const y = ~~scale(tick);
			const line = document.createElementNS(NS, 'line');
			line.setAttributeNS(null, 'x1', x[0]);
			line.setAttributeNS(null, 'x2', x[1]);
			line.setAttributeNS(null, 'y1', y);
			line.setAttributeNS(null, 'y2', y);
			line.setAttributeNS(null, 'stroke', 'gray');
			line.setAttributeNS(null, 'stroke-dasharray', '1, 2');

			const text = document.createElementNS(NS, 'text');
			text.textContent = tick;
			text.setAttributeNS(null, 'x', 0);
			text.setAttributeNS(null, 'y', y);
			text.setAttributeNS(null, 'fill', 'gray');
			result.push(line);
			result.push(text);
		});

		return result;
	}

	return {
		c: create,
		s: set,
		ss: sets,
		g: get,
		gs: gets,
		t: text,
		p: path,

		getXY: getXY,
		tickRange: tickRange,
		tickPlus: tickPlus,
		tickVertical: createSVGVertical,
		tickHorizontal: createSVGHorizontal,
	}
})();

/**
 * svgss(element, {x: 1, y: 2});
 */

const svgc = SVGE.c;
const svgs = SVGE.s;
const svgss = SVGE.ss;
const svgg = SVGE.g;
const svggs = SVGE.gs;
const svgt = SVGE.t;
const svgp = SVGE.p;
