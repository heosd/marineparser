// -- do not parse here, all data should parsed before!, its just display
class CTDGroup extends HTMLElement {
	constructor(ds) {
		super();
		if (ds) {
			this.setDataSource(ds);
		}
	}

	setDataSource(ds) {
		this.ds = ds;

		this.header = ds.summary.hdr;
		this.utc = this.header.utc;

		this.refreshChild();
	}

	getDataSource() {
		return this.ds;
	}

	getUTC() {
		return this.utc;
	}

	refreshChild() {
		this.innerHTML = ''; // -- clear

		const p = document.createElement('p');
		p.style.display = 'flex';
		p.style.marginTop = '8px';
		p.style.marginBottom = '8px';

		this.p = p;
		this.appendChild(p);

		const summary = this.ds.summary;

		this.appendSpan(this.ds.summary.name, 2);
		this.appendSpan(this.utc.toLocaleString('af', { timeZone: 'UTC' }), 2);
		this.appendSpan(`${this.header.nmeaLat}, ${this.header.nmeaLng}`, 2);
		this.appendSpan(Math.round(summary.d[1]) + 'm', 1);

		// -- Bottle
		if (summary.bl) {
			this.appendSpan(`${summary.bl.countFired} BTL fired`, 1);
		} else {
			this.appendSpan(`0 BTL fired`, 1);
		}

		// -- Date from dateHex
		if (!summary.dateHex[0] || !summary.dateHex[1]) {
			this.appendSpan(`Invalid Date`);
		} else {
			const msDiff = summary.dateHex[1].getTime() - summary.dateHex[0].getTime();
			const minDiff = Math.round(msDiff / 1000 / 60);
			if (60 * 10 > minDiff) {
				this.appendSpan(`${minDiff}min`);
			} else {
				this.appendSpan(`Invalid duration`);
			}
		}

		// -- sensors
		const freq = [], volt = [];
		for (const [k, v] of Object.entries(summary.sensors)) {
			let s = prettyPrintSensor(v);
			if (!s) {
				s = '__';
			}

			if ('f' === k[0] && v) {
				freq.push(s);
			} else if ('v' === k[0] && v) {
				volt.push(s);
			}
		}

		this.appendSpan(`${freq.length} + ${volt.length}`);
	}

	setAsHeader() {
		this.innerHTML = ''; // -- clear

		const p = document.createElement('p');
		p.style.display = 'flex';
		p.style.marginTop = '8px';
		p.style.marginBottom = '8px';
		p.style.fontWeight = '600';

		this.p = p;
		this.appendChild(p);

		this.appendSpan('File Name', 2);
		this.appendSpan('Date', 2);
		this.appendSpan('Lat, Lng', 2);
		this.appendSpan('Depth', 1);
		this.appendSpan('Bottle Fired', 1);
		this.appendSpan('Duration');
		this.appendSpan('Sensors');
	}

	appendSpan(text, flex = 1) {
		const span = document.createElement('span');
		span.style.flex = flex;
		span.textContent = text;
		span.style.fontFamily = 'Arial, monospace';
		this.p.appendChild(span);
	}
}

customElements.define('ctd-group', CTDGroup);

class CTDGroupDetail extends HTMLElement {
	constructor(ds) {
		super();

		this.execShadow();

		if (ds) {
			this.setDataSource(ds);
		}
	}

	static TEMPLATE_STYLE = `
.parent4 {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
}

.parent2-fixed {
	display: grid;
	grid-template-columns: 600px 500px;
	grid-column-gap: 40px;
}

.parent2 {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	grid-column-gap: 20px;
}

.parent12 {
	display: grid;
	grid-template-columns: 1fr 2fr;
	grid-column-gap: 20px;
}

.parent5 {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
}

.mono {
	font-family: "Arial", monospace;
}

.text-center {
	text-align: center;
}

.text-right {
	text-align: right;
}

.border {
	border: black 1px solid;
}

.bold {
	font-weight: 800;
}

.pad {
	padding: 25px;
}

	`;

	static TEMPLATE_HTML = `
<div class="pad parent2-fixed">
	<div id="area-left">
		<h1>
			Detail
		</h1>
		<div class="parent12 mono">
			<span class="bold">File</span>
			<span id="txtFile" class="text-right"></span>
			<span class="bold" title="utc time is in hex header, duration in hex nmea date difference">UTC</span>
			<span id="txtDateUTC" class="text-right"></span>
			<span class="bold">Latitude</span>
			<span id="txtLat" class="text-right"></span>
			<span class="bold">Longitude</span>
			<span id="txtLng" class="text-right"></span>
			<span class="bold" title="Not a depth in position, just CTD max depth">Max depth CTD</span>
			<span id="txtDepth" class="text-right"></span>
			<span class="bold">Sensors</span>
			<span id="txtSensors" class="text-right"></span>
			<span class="bold">Bottle Fired</span>
			<span id="txtBottleFired" class="text-right"></span>
		</div>

		<!-- Sensors -->
		<h1>Sensors</h1>
		<div class="parent4 bold mono">
			<span>Channel</span>
			<span>Type</span>
			<span>Serial</span>
			<span>Calibration date</span>
		</div>
		<div class="parent4 mono" id="areaSensors">
		</div>

		<!-- Bottle Fired -->
		<h1>Bottle triggered</h1>
		<div class="parent5 bold text-center mono">
			<span>Triggered</span>
			<span>Depth</span>
			<span>Altimeter</span>
			<span>Temperature</span>
			<span>Salinity</span>
		</div>
		<div class="parent5 text-right mono" id="areaBottles">
		</div>
	</div>
	<div id="area-right">
		<div style="margin-top: 70px;"></div>
		<h2>Underwater Bottom / Top</h2>
		<svg width="550" height="700">
			<defs>
				<g id="pin2">
					<circle r="25" cx="0" cy="0" fill="none" stroke="black"></circle>
					<circle r="4" cx="-10" cy="10"></circle>
					<circle r="2" cx="10" cy="-10"></circle>
				</g>

				<g id="pin3">
					<circle r="25" cx="0" cy="0" fill="none" stroke="black"></circle>
					<circle r="4" cx="0" cy="-10"></circle>
					<circle r="2" cx="-10" cy="10"></circle>
					<circle r="2" cx="10" cy="10"></circle>
				</g>

				<g id="pin6">
					<circle r="25" cx="0" cy="0" fill="none" stroke="black"></circle>
					<circle r="4" cx="-7" cy="-13"></circle>
					<circle r="2" cx="7" cy="-13"></circle>
					<circle r="2" cx="-14" cy="0"></circle>
					<circle r="2" cx="14" cy="0"></circle>
					<circle r="2" cx="-7" cy="13"></circle>
					<circle r="2" cx="7" cy="13"></circle>
				</g>
			</defs>
			<g>
				<circle r="150" cx="170" cy="170" fill="none" stroke="black"></circle>
				<use x="170" y="170" href="#pin2"/>
				<use x="170" y="170" href="#pin2" transform="translate(0 -100)"/>
				<circle r="25" cx="170" cy="170" transform="translate(0 100)" fill="none" stroke="black"></circle>
				<use x="170" y="170" href="#pin3" transform="translate(-80 -50)"/>
				<use x="170" y="170" href="#pin3" transform="translate(80 -50)"/>
				<use x="170" y="170" href="#pin3" transform="translate(80 50)"/>
				<use x="170" y="170" href="#pin3" transform="translate(-80 50)"/>

				<text x="170" y="170" id="JB6" transform="translate(0 -35)" text-anchor="middle">JB6
					<title id="JB6-title">JB6</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
				<text x="170" y="170" id="JB3" transform="translate(0 -135)" text-anchor="middle">JB3 Pump</text>
				<text x="170" y="170" id="JB0" transform="translate(0 145)" text-anchor="middle">Pressure
					<title id="JB0-title">Pressure</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
				<text x="170" y="170" id="JB2" transform="translate(-80 -5)" text-anchor="middle">JB2
					<title id="JB2-title">JB2</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
				<text x="170" y="170" id="JB4" transform="translate(80 -5)" text-anchor="middle">JB4
					<title id="JB4-title">JB4</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
				<text x="170" y="170" id="JB5" transform="translate(80 100)" text-anchor="middle">JB5
					<title id="JB5-title">JB5</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
				<text x="170" y="170" id="JB1" transform="translate(-80 100)" text-anchor="middle">JB1
					<title id="JB1-title">JB1</title>
					<tspan></tspan>
					<tspan></tspan>
				</text>
			</g>

			<g transform="translate(0 350)">
				<circle r="150" cx="170" cy="170" fill="none" stroke="black"></circle>
				<use x="170" y="170" href="#pin6"/>
				<use x="170" y="170" href="#pin2" transform="translate(0 -100)"/>
				<circle r="25" cx="170" cy="170" transform="translate(0 100)" fill="none" stroke="black"></circle>
				<use x="170" y="170" href="#pin6" transform="translate(-80 -50)"/>
				<use x="170" y="170" href="#pin6" transform="translate(80 -50)"/>
				<use x="170" y="170" href="#pin6" transform="translate(80 50)"/>
				<use x="170" y="170" href="#pin6" transform="translate(-80 50)"/>

				<text x="170" y="170" id="JT7" transform="translate(0 -35)" text-anchor="middle">
					<title id="JT7-title">JT7</title>
					<tspan x="30%">JT7</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>
				<text x="170" y="170" id="JT1" transform="translate(0 -135)" text-anchor="middle">JT1</text>
				<text x="170" y="170" id="JT4" transform="translate(0 145)" text-anchor="middle">
					<title id="JT4-title">JT4</title>
					<tspan x="30%">JT4</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>
				<text x="170" y="170" id="JT6" transform="translate(-80 -5)" text-anchor="middle">
					<title id="JT6-title">JT6 AUX4 V6 V7</title>
					<tspan x="30%">JT6</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>
				<text x="170" y="170" id="JT2" transform="translate(80 -5)" text-anchor="middle">
					<title id="JT2-title">JT2 AUX1 V0 V1</title>
					<tspan x="30%">JT2</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>
				<text x="170" y="170" id="JT3" transform="translate(80 100)" text-anchor="middle">
					<title id="JT3-title">JT3 AUX2 V2 V3</title>
					<tspan x="30%">JT3</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>
				<text x="170" y="170" id="JT5" transform="translate(-80 100)" text-anchor="middle">
					<title id="JT5-title">JT5 AUX3 V4 V5</title>
					<tspan x="30%">JT5</tspan>
					<tspan x="30%" dy=1.2em></tspan>
				</text>	
			</g>
		</svg>

		<h2>Brief Temp, Sal over Depth</h2>
		<svg id="svgSamples" width="550" height="500">
		</svg>
	</div>
</div>
	`;

	setDataSource(ds) {
		this.ds = ds;
		this.refreshChild();
	}

	execShadow() {
		const shadowRoot = this.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		const body = document.createElement('div');
		style.textContent = CTDGroupDetail.TEMPLATE_STYLE;
		body.innerHTML = CTDGroupDetail.TEMPLATE_HTML;

		shadowRoot.appendChild(style);
		shadowRoot.appendChild(body);
		this.shadow = shadowRoot;

		this.getElementsList(['txtFile', 'txtDateUTC', 'txtLat', 'txtLng', 'txtDepth', 'txtSensors', 'txtBottleFired']);
		this.getElementsList(['areaSensors', 'areaBottles', 'svgSamples']);
		this.getElementsList(['JB1', 'JB2', 'JB4', 'JB5', 'JB6', 'JB0']);
		this.getElementsList(['JT1', 'JT2', 'JT3', 'JT5', 'JT6', 'JT7']);
	}

	static Span(text) {
		const e = document.createElement('span');
		e.innerHTML = text;
		return e;
	}

	// -- summary
	refreshChild() {
		const s = this.ds.summary;
		const hexHdr = s.hdr;

		// -- file name
		let fileName = undefined, fileExt = [];
		Object.values(s.files).forEach(file => {
			const m = file.name.match(/^([^.]+)\.(.*)$/);
			fileName = m[1];
			fileExt.push(m[2]);
		});
		this.$txtFile.textContent = `${fileName} [${fileExt.join(' ')}]`;

		// -- utc in hexHdr, duration in hex raw date min max
		const utc = hexHdr.utc.toLocaleString('af', { timeZone: 'UTC' });
		const diffMS = s.dateHex[1].getTime() - s.dateHex[0].getTime();
		const duration = msToReadable(diffMS);
		this.$txtDateUTC.textContent = `${utc} (${duration})`;

		this.$txtLat.textContent = hexHdr.nmeaLat;
		this.$txtLng.textContent = hexHdr.nmeaLng;
		this.$txtDepth.textContent = Math.round(s.d[1]).toLocaleString('en') + 'm';

		// -- sensors
		const countSensors = { f: 0, v: 0 };
		Object.entries(s.sensors).forEach(item => {
			if (item[1]) {
				const prefix = item[0].slice(0, 1);
				countSensors[prefix]++;
			}
		});
		this.$txtSensors.textContent = `${countSensors.f + countSensors.v} : ${countSensors.f} + ${countSensors.v}`;
		this.$txtSensors.title = `Frequency ${countSensors.f}, Voltage ${countSensors.v}`;

		// -- bottle
		if (s.bl) {
			this.$txtBottleFired.textContent = s.bl.countFired;
		} else {
			this.$txtBottleFired.textContent = 0;
		}


		this.refreshChildSensors();
		this.refreshChildBottles();
		this.refreshChildSamples();
	}

	refreshChildSensors() {
		const PS = ParserCTD.SeaConvert.PrettySensor;
		const s = this.ds.summary.sensors;

		this.$areaSensors.innerHTML = '';

		const r = [];
		Object.keys(s).forEach(k => {
			const v = s[k];

			// -- undefined value where no sensor
			if (!v) {
				return;
			}

			// -- in List
			this.$areaSensors.appendChild(CTDGroupDetail.Span(k));
			this.$areaSensors.appendChild(CTDGroupDetail.Span(v.type));
			this.$areaSensors.appendChild(CTDGroupDetail.Span(v.serial));
			this.$areaSensors.appendChild(CTDGroupDetail.Span(v.calibration));
		});

		const sensorOutput = [
			[s.f0, null, this.$JB1, 'JB1'],
			[s.f1, null, this.$JB2, 'JB2'],
			[s.f2, null, this.$JB0, 'Pressure'],
			[s.f3, null, this.$JB4, 'JB4'],
			[s.f4, null, this.$JB5, 'JB5'],
			[s.v0, s.v1, this.$JT2, 'JT2 AUX1'],
			[s.v2, s.v3, this.$JT3, 'JT3 AUX2'],
			[s.v4, s.v5, this.$JT5, 'JT5 AUX3'],
			[s.v6, s.v7, this.$JT6, 'JT6 AUX4'],
		];

		sensorOutput.forEach(d => {
			if (!d[0]) {
				return;
			}

			if (d[0]) {
				d[2].getElementsByTagName('tspan')[0].textContent = PS(d[0]);
			}

			if (d[1]) {
				d[2].getElementsByTagName('tspan')[1].textContent = PS(d[1]);
			}
		});
	}

	refreshChildBottles() {
		if (!this.ds.summary.bl) {
			for (let i = 0; i < 5; i++) {
				this.$areaBottles.appendChild(CTDGroupDetail.Span('-'));
			}

			return;
		}
		const b = this.ds.summary.bl.fired;

		// -- to short
		const cv = ParserCTD.SeaConvert;

		this.$areaBottles.innerHTML = '';
		const values = Object.values(b);
		values.forEach(v => {
			this.$areaBottles.appendChild(CTDGroupDetail.Span(v.fired));
			this.$areaBottles.appendChild(CTDGroupDetail.Span(cv.PrettyDepth(v.depth)));
			this.$areaBottles.appendChild(CTDGroupDetail.Span(cv.PrettyDepth(v.altimeter)));
			this.$areaBottles.appendChild(CTDGroupDetail.Span(cv.PrettyTemp(v.t)));
			this.$areaBottles.appendChild(CTDGroupDetail.Span(cv.PrettySal(v.s)));
		});

		if (0 === values.length) {
			for (let i = 0; i < 5; i++) {
				this.$areaBottles.appendChild(CTDGroupDetail.Span('-'));
			}
		}
	}

	static DepthRange(range) {
		const r = {
			org: range,
			depth: range,
			tick: 0,
		};

		if (range > 1000) {
			r.depth = Math.floor(1000 * (Math.floor(range / 1000) + 1));
			r.tick = 1000;
		} else if (range > 500) {
			r.depth = 1000;
			r.tick = 200;
		} else if (range > 100) {
			r.depth = Math.floor(100 * (Math.floor(range / 100) + 1));
			r.tick = 100;
		} else {
			r.depth = 100;
			r.tick = 20;
		}

		return r;
	}

	refreshChildSamples() {
		const s = this.ds.summary;
		const samples = this.ds.summary.samples;
		const w = 400, h = 400;

		const tickDepth = CTDGroupDetail.DepthRange(s.d[1]);
		const srcY = [[0, tickDepth.depth], [0, h]];
		const srcT = [[0, 35], [0, w]];
		const srcS = [[31.5, 35], [0, w]];

		const ticksVertical = SVGE.tickRange(srcT[0], 7);
		const ticksVerticalSal = [31.5, 32, 32.5, 33, 33.5, 34, 34.5, 35];
		const ticksHorizontal = SVGE.tickPlus(srcY[0], tickDepth.tick);
		const ticksT = SVGE.tickVertical(srcT[0], srcT[1], null, [0, w], null, ticksVertical);
		ticksT.filter(d => 'text' === d.tagName).forEach(d => d.setAttributeNS(null, 'fill', 'red'));
		ticksT.forEach(d => this.$svgSamples.appendChild(d));
		const ticksS = SVGE.tickVertical(srcS[0], srcS[1], null, [h - 30, h], null, ticksVerticalSal).filter(d => 'text' === d.tagName);
		ticksS.forEach(d => d.setAttributeNS(null, 'fill', 'blue'));
		ticksS.forEach(d => this.$svgSamples.appendChild(d));

		SVGE.tickHorizontal(srcY[0], srcY[1], null, [0, h], null, ticksHorizontal).forEach(d => this.$svgSamples.appendChild(d));

		const scaleY = scaleLinear(...srcY);
		// const scaleTemp = scaleLinear([(~~s.t[1]) - 4, (~~s.t[1]) + 0.5], [0, w]);
		const scaleTemp = scaleLinear(...srcT);
		// const scaleSal = scaleLinear([(~~s.s[1]) - 4, (~~s.s[1]) + 0.5], [0, w]);
		const scaleSal = scaleLinear(...srcS);

		const pt = SVGE.p();
		const ps = SVGE.p();

		samples.forEach(sample => {
			const y = scaleY(sample[3]);
			const xt = scaleTemp(sample[1]);
			const xs = scaleSal(sample[2]);
			pt.add(~~xt, ~~y);
			ps.add(~~xs, ~~y);
		});

		const et = pt.create();
		const es = ps.create();
		et.setAttributeNS(null, 'stroke', 'red');
		es.setAttributeNS(null, 'stroke', 'blue');
		this.$svgSamples.appendChild(et);
		this.$svgSamples.appendChild(es);
	}

	getElementsList(list) {
		for (let i = 0; i < list.length; i++) {
			const id = list[i];
			const e = this.shadow.getElementById(id);
			if (e) {
				this['$' + id] = e;
			}
		}
	}
}

customElements.define('ctd-group-detail', CTDGroupDetail);

// CTDGroupList
class CTDGroupList extends HTMLElement {
	constructor() {
		super();

		const groupHeader = new CTDGroup();
		groupHeader.setAsHeader();
		this.appendChild(groupHeader);
	}

	addGroup(group) {
		const newNode = new CTDGroup(group);
		newNode.addEventListener('click', (e) => {
			const ds = newNode.getDataSource();
			// document.getElementById('resultDetail').setDataSource(ds);
			console.log(ds);
		})

		if (1 === this.childNodes.length) {
			this.appendChild(newNode);
		} else {
			let added = false;
			for (let i = 1; i < this.childNodes.length; i++) {
				const node = this.childNodes[i];

				const utc = newNode.getUTC().getTime();
				const nodeUTC = node.getUTC().getTime();

				if (utc < nodeUTC) {
					this.insertBefore(newNode, node);
					added = true;
					break;
				}
			}

			if (false === added) {
				this.appendChild(newNode);
			}
		}
	}
}

customElements.define('ctd-group-list', CTDGroupList);