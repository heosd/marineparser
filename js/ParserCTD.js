const ParserCTD = (() => {
	function getValueFromObject(obj, exp) {
		const m = exp.match(/([^\.\[]*)/g);
		const list = [];
		m.forEach(item => {
			if (0 === item.length) {
				return;
			}

			// -- [4] -> int 4
			if (item.match(/(\d+)\]$/)) {
				list.push(parseInt(item))
			} else {
				list.push(item);
			}
		});

		if (0 === list.length) {
			console.log(`getValueFromObject Invalid expression ${obj}, '${exp}'`);
			return undefined;
		}

		let dest = obj;
		list.forEach(name => dest = dest[name]);

		return dest;
	}

	class CTDFileList {
		constructor() {
			this.listFiles = [];
			this.listURLs = [];
			this.mapGroup = {};
		}

		addFile(file) {
			const m = CTDFileList.MatchFileName(file.name);
			if (m && true === m.found) {
				this.listFiles.push(file);

				if (!this.mapGroup.hasOwnProperty(m.filenameLower)) {
					this.mapGroup[m.filenameLower] = new CTDGroup();
				}

				this.mapGroup[m.filenameLower].addFile(file);
			}
		}

		addURL(url) {
			const m = CTDFileList.MatchFileName(url);
			if (m && true === m.found) {
				this.listURLs.push(url);

				if (!this.mapGroup.hasOwnProperty(m.filenameLower)) {
					this.mapGroup[m.filenameLower] = new CTDGroup();
				}

				this.mapGroup[m.filenameLower].addURL(url);
			}
		}

		getGroup(name) {
			if (!this.mapGroup.hasOwnProperty(name)) {
				return undefined;
			}

			return this.mapGroup[name];
		}

		getNames() {
			return Object.keys(this.mapGroup);
		}

		getGroups() {
			return Object.values(this.mapGroup);
		}

		static MatchFileName(name) {
			const m = name.match(/([^/]*)\.([^.]*)$/i);
			if (m) {
				const filename = m[1];
				const filenameLower = filename.toLowerCase();
				const ext = m[2];
				const extLower = ext.toLowerCase();

				const found = ['hex', 'bl', 'hdr', 'xmlcon'].findIndex(rawExts => extLower === rawExts);
				return {
					filename: filename,
					filenameLower: filenameLower,
					ext: ext,
					extLower: extLower,
					found: -1 !== found
				}
			}

			return undefined;
		}
	}

	class CTDGroup {
		constructor() {
			this.files = {
				bl: undefined,
				hdr: undefined,
				hex: undefined,
				xmlcon: undefined
			}

			this.urls = {
				bl: undefined,
				hdr: undefined,
				hex: undefined,
				xmlcon: undefined,
			}

			this.instance = {
				bl: undefined,
				hdr: undefined,
				hex: undefined,
				xmlcon: undefined,
			}

			this.name = undefined;
		}

		addFile(file) {
			const m = CTDFileList.MatchFileName(file.name);
			if (m && true === m.found) {
				this.files[m.extLower] = file;
				this.name = m.filename;
			}
		}

		addURL(url) {
			const m = CTDFileList.MatchFileName(url);
			if (m && true === m.found) {
				this.urls[m.extLower] = url;
				this.name = m.filename;
			}
		}

		getName() {
			return this.name;
		}

		async parse() {
			if (this.files.hex) {
				const hex = new CTDHex();
				this.instance.hex = hex;
				hex.setParent(this);

				await hex.setFile(this.files.hex);
			}

			if (this.files.xmlcon) {
				const xmlcon = new CTDXMLCON();
				this.instance.xmlcon = xmlcon;
				xmlcon.setParent(this);

				await xmlcon.setFile(this.files.xmlcon);
			}

			if (this.files.hdr) {
				const hdr = new CTDHDR();
				this.instance.hdr = hdr;
				hdr.setParent(this);

				await hdr.setFile(this.files.hdr);
			}

			if (this.files.bl) {
				const bl = new CTDBL();
				this.instance.bl = bl;
				bl.setParent(this);

				await bl.setFile(this.files.bl);
			}
		}

		async parseURLs() {
			if (this.urls.hex) {
				const hex = new CTDHex();
				this.instance.hex = hex;
				hex.setParent(this);

				await hex.setFileURL(this.urls.hex);
			}

			if (this.urls.xmlcon) {
				const xmlcon = new CTDXMLCON();
				this.instance.xmlcon = xmlcon;
				xmlcon.setParent(this);

				await xmlcon.setFileURL(this.urls.xmlcon);
			}

			if (this.urls.hdr) {
				const hdr = new CTDHDR();
				this.instance.hdr = hdr;
				hdr.setParent(this);

				await hdr.setFileURL(this.urls.hdr);
			}

			if (this.urls.bl) {
				const bl = new CTDBL();
				this.instance.bl = bl;
				bl.setParent(this);

				await bl.setFileURL(this.urls.bl);
			}
		}

		unload() {
			// -- call each instance unload
		}

		getHex() {
			return this.instance.hex;
		}
		getXmlcon() {
			return this.instance.xmlcon;
		}
		getHdr() {
			return this.instance.hdr;
		}
		getBl() {
			return this.instance.bl;
		}

		parseMeta() {
			const meta = {};
			const metaDesc = {};

			const hex = this.getHex();
			const hdr = this.getHdr();
			const xmlcon = this.getXmlcon();

			if (hex) {
				const metaHex = hex.parseMeta();
				const metaDescHex = CTDHex.GetMetaDesc();
				['lat', 'lng', 'ts', 'ms', 'count', 'desc', 'bytes'].forEach(k => {
					meta[k] = metaHex[k];
					metaDesc[k] = metaDescHex[k];
				});
			} else if (hdr) {
				const metaHDR = hdr.parseMeta();
				const metaDescHDR = CTDHDR.GetMetaDesc();
				['lat', 'lng', 'ts', 'ms', 'bytes'].forEach(k => {
					meta[k] = metaHDR[k];
					metaDesc[k] = metaDescHDR[k];
				});
			}

			if (xmlcon) {
				const metaXML = xmlcon.parseMeta();
				const metaDescXML = CTDXMLCON.GetMetaDesc();
				['eq', 'eqid'].forEach(k => {
					meta[k] = metaXML[k];
					metaDesc[k] = metaDescXML[k];
				});
			}

			this.meta = meta;
			this.metaDesc = metaDesc;

			return meta;
		}

		getMeta() {
			return this.meta;
		}

		// -- you can get metaDesc more specific
		static GetMetaDesc() {
			return {
				lat: 'HEX, HDR string NMEA Latitude = lat',
				lng: 'HEX, HDR string NMEA Longitude = lng',
				ts: 'HEX, HDR string NMEA UTC (Time) = ts',
				ms: 'HEX, HDR string NMEA UTC (Time) = ts to ms',
				count: 'HEX length of line',
				desc: 'HEX getParsingDescription()',
				bytes: 'HEX, HDR content-length or file.size'
			}
		}
	}

	class CTDChild {
		constructor() {
			this.parent = undefined;
		}

		setParent(parent) {
			this.parent = parent;
		}

		getHex() {
			if (this.parent) {
				return this.parent.getHex();
			}
		}

		getXmlcon() {
			if (this.parent) {
				return this.parent.getXmlcon();
			}
		}

		getBl() {
			if (this.parent) {
				return this.parent.getBl();
			}
		}

		getHdr() {
			if (this.parent) {
				return this.parent.getHdr();
			}
		}
	}

	class CTDHDR extends CTDChild {
		constructor() {
			super();
			this.file = undefined;
			this.parsedHDR = undefined;
		}

		static parseHDR(str) {
			const bytes = str.match(/Number of Bytes Per Scan = (.*)$/m);
			const lat = str.match(/NMEA Latitude = (.*)$/m);
			const lng = str.match(/NMEA Longitude = (.*)$/m);
			const utc = str.match(/NMEA UTC \(Time\) = (.*)$/m);
			const scanAvg = str.match(/Number of Scans Averaged by the Deck Unit = (.*)$/m);

			const obj = {
				bytes: bytes,
				lat: lat,
				lng: lng,
				utc: utc,
				scanAvg: scanAvg
			}

			if (obj.bytes) {
				obj.bytes = parseInt(obj.bytes[1]);
			}

			if (obj.lat) {
				obj.nmeaLat = obj.lat[1];
				const dm = obj.lat[1].match(/(\d*) ([\d\.]*) (N|S)/);
				if (dm) {
					const degree = parseInt(dm[1]);
					const minute = parseFloat(dm[2]) / 60;
					obj.lat = degree + minute;
					if ('S' === dm[3]) {
						obj.lat = obj.lat * -1;
					}
				}
			}

			if (obj.lng) {
				obj.nmeaLng = obj.lng[1];
				const dm = obj.lng[1].match(/(\d*) ([\d\.]*) (E|W)/);
				if (dm) {
					const degree = parseInt(dm[1]);
					const minute = parseFloat(dm[2]) / 60;
					obj.lng = degree + minute;
					if ('W' === dm[3]) {
						obj.lng = obj.lng * -1;
					}
				}
			}

			if (obj.utc) {
				const dateStr = obj.utc[1];
				let utc = new Date(dateStr);
				// -- add my time zone
				utc = new Date(utc.getTime() + (utc.getTimezoneOffset() * 60 * 1000 * -1));
				obj.nmeaUTC = dateStr;
				obj.utc = utc;
			}

			// -- if its 1, its 24hz scans. otherwise I dont know
			if (obj.scanAvg) {
				obj.scanAvg = parseInt(obj.scanAvg[1]);
			}

			return obj;
		}

		async setFile(file) {
			const text = await file.text();
			this.setDataSource(text);
			this.bytes = file.size;
		}

		async setFileURL(url) {
			const r = await fetch(url);
			const bytes = r.headers.get('content-length');
			const text = await r.text();
			this.setDataSource(text);
			this.bytes = parseInt(bytes);
		}

		setDataSource(str) {
			this.dataSource = str;
			const result = CTDHDR.parseHDR(this.dataSource);
			this.parsedHDR = result;
		}

		getParsedHDR() {
			return this.parsedHDR;
		}

		parseMeta() {
			if (!this.parsedHDR) {
				console.error('hdr should parsed before');
				return;
			}

			const meta = {};

			meta.lat = this.parsedHDR.lat;
			meta.lng = this.parsedHDR.lng;
			meta.ts = this.parsedHDR.utc;
			meta.ms = meta.ts.getTime();
			meta.bytes = this.bytes;

			this.meta = meta;
			return meta;
		}

		getMeta() {
			return this.meta;
		}

		static GetMetaDesc() {
			return {
				lat: 'HDR string NMEA Latitude = lat',
				lng: 'HDR string NMEA Longitude = lng',
				ts: 'HDR string NMEA UTC (Time) = ts',
				ms: 'HDR string NMEA UTC (Time) = ts to ms',
				bytes: 'HDR content-length header or file.size'
			}
		}
	}

	class CTDBL extends CTDChild {
		constructor() {
			super();
			this.file = undefined;
			this.dataSource = undefined;
		}

		// -- Saving the last only
		static parseBL(str) {
			const mapFired = {};
			let countFired = 0;

			const lines = str.split('\n');
			lines.forEach((line) => {
				const r = CTDBL.parseBLLine(line);
				if (r) {
					countFired++;
					mapFired[r.fired] = r;
				}
			});

			const result = {
				countFired: countFired,
				fired: mapFired
			};

			return result;
		}

		static parseBLLine(line) {
			const commas = line.split(',')
			if (5 !== commas.length) {
				return false;
			}

			const result = {
				fired: parseInt(commas[1]),
				dateStr: commas[2],
				rawLineS: parseInt(commas[3]),
				rawLineE: parseInt(commas[4])
			};

			return result;
		}

		// -- Manipulate blObj
		static parseBLHEX(blObj, hex) {
			if (blObj.fired && hex) {
				Object.keys(blObj.fired).forEach((key) => {
					const fired = blObj.fired[key];
					const hexValue = hex.parseValue(fired.rawLineS);

					const altimeter = hexValue.value.altimeter;
					const depth = hexValue.value.f2depth;
					const t = hexValue.value.f0;
					const s = hexValue.value.f1psu;
					if (altimeter) {
						fired.altimeter = hexValue.value.altimeter;
					}
					fired.depth = depth;
					fired.t = t;
					fired.s = s;
				});
			}
		}

		async setFile(file) {
			const text = await file.text();
			this.setDataSource(text);
			this.bytes = file.size;
		}

		async setFileURL(url) {
			const r = await fetch(url);
			const bytes = r.headers.get('content-length');
			const text = await r.text();
			this.setDataSource(text);
			this.bytes = parseInt(bytes);
		}

		setDataSource(str) {
			this.dataSource = str;
			const blObj = CTDBL.parseBL(this.dataSource);
			if (!this.getHex()) {
				console.error(`CTDBL.setDataSource : got no hex, can not proceed`);
				console.log(blObj);
				return;
			}
			CTDBL.parseBLHEX(blObj, this.getHex()); // -- Manipulate the blObj
			this.parsedBL = blObj;
		}

		getParsedBL() {
			return this.parsedBL;
		}
	}

	class CTDHex extends CTDChild {
		// -- Time starts from 2000-01-01 00:00:00
		static TIME_BASE_MS = 946684800000;
		// -- If dateMS difference is bigger than 10s, just drop it
		// -- logged date is invalid at the beginning

		constructor() {
			super();
			this.file = undefined;
			this.dataSource = undefined;

			// -- Default
			this.parsingDesc = {
				countFreq: 3,
				countAD: 0,
				countADWords: 0,
				surfacePar: false,
				nmeaPosition: false,
				nmeaDepth: false,
				nmeaTime: false,
				scanTime: false,
				scanAvg: -99
			}
		}

		async setFile(file) {
			const text = await file.text();
			this.setDataSource(text);
			this.bytes = file.size;
		}

		async setFileURL(url) {
			const r = await fetch(url);
			const bytes = r.headers.get('content-length');
			const text = await r.text();
			this.setDataSource(text);
			this.bytes = parseInt(bytes);
		}


		// -- this holds raw data as string, not parsed
		setDataSource(str) {
			// -- Should update before parsing
			this.updateParsingDescription();

			const hexObj = CTDHex.SplitEdge(str);
			this.header = hexObj.header;
			this.body = hexObj.body;
			this.bodyLength = hexObj.bodyLength;
			this.lineLength = hexObj.lineLength;
			this.EOLLength = hexObj.EOLLength;

			this.parseHeader();
			// this.dataSource = hexObj;
		}

		static SplitEdge(str) {
			const head2048 = str.slice(0, 2048);
			const ASTERISK = 42;
			const CR = 13,
				LF = 10;

			// -- find end of header where no Asterisk with LineFeed
			let EOH = undefined;
			for (let i = 0; i < head2048.length - 1; i++) {
				const code = head2048.charCodeAt(i);
				if (LF === code) {
					const codeNext = head2048.charCodeAt(i + 1);
					if (ASTERISK !== codeNext) {
						EOH = i;
						break;
					}
				}
			}

			if (!EOH) {
				return undefined;
			}
			const header = head2048.slice(0, EOH);
			const body = str.slice(EOH + 1);
			let bodyLength = -1;
			let lineLength = -1;
			let EOLLength = 1; // 1 = LF only, 2 = CRLF

			// -- find line length as byte includes CR LF
			for (let i = 0; i < 1024; i++) {
				if (LF === body.charCodeAt(i)) {
					lineLength = i + 1;

					bodyLength = body.length / lineLength;
					break;
				}
			}

			// -- check is there CR to increase EOLLength
			if (CR === body.charCodeAt(lineLength - 2)) {
				EOLLength = 2;
			}

			// -- Create Function to get body except CRLF
			const getLine = (idx) => {
				if (idx >= bodyLength) {
					return undefined;
				}

				const idxS = lineLength * idx;
				const idxE = idxS + lineLength;
				const line = body.slice(idxS, idxE - EOLLength);
				return line;
			};

			return {
				header: header,
				body: body,
				bodyLength: bodyLength,
				lineLength: lineLength,
				EOLLength: EOLLength,
				getLine: getLine
			};
		}


		// '11BB' -> [0x11, 0xBB]
		static Ascii2ta(str) {
			const buf = new Uint8Array(str.length / 2);
			let bufIdx = 0;
			for (let i = 0; i < str.length; i = i + 2) {
				const v = (parseInt(str[i], 16) << 4) + parseInt(str[i + 1], 16);
				buf[bufIdx++] = v;
			}

			return buf;
		}

		parseHeader() {
			const hdrObj = CTDHDR.parseHDR(this.header);
			this.parsedHDR = hdrObj;

			// -- NMEA UTC Time with Scan Average
			if (1 === this.parsedHDR.scanAvg) {
				const sec = parseInt(this.getLength() / 24);
				this.parsedHDR.scanDuration = sec;
			} else {
				this.parsedHDR.scanDuration = -99;
			}
		}

		getParsedHDR() {
			// -- should call parseHeader first
			return this.parsedHDR;
		}

		// [0x11, 0xF6, 0x8B, 0x0A....]
		getRaw(lineIdx) {
			// -- just implement again
			if (lineIdx >= this.bodyLength) {
				return undefined;
			}

			const idxS = this.lineLength * lineIdx;
			const idxE = idxS + this.lineLength;
			const line = this.body.slice(idxS, idxE - this.EOLLength);

			// -- maybe cache

			return CTDHex.Ascii2ta(line);
		}

		// -- This is not a raw parsing, you can just skip this function and implement by yourself
		parseValue(lineNo) {
			const xmlcon = this.getXmlcon();
			if (!xmlcon) {
				console.error(`CTDHex.getValue : No xmlcon given`);
				return false;
			}

			const sensors = xmlcon.getParsedMap();
			const keyAltimeter = xmlcon.findSensorKeyByType('Altimeter');

			const c = this.parseRaw(lineNo);

			// -- Pressure sensor Temperature in Celsius
			// -- Formula not presented, just made it
			// -- 2500 -> approximately 22C
			const psTC = c.psT * sensors.f2.coef.AD590M + sensors.f2.coef.AD590B;

			// -- vf0 degree celsius - ITS 90
			const vf0 = sensors.f0.getValue(c.f0).DegreeC;

			// -- vf2 psia, psia -14.7 = psi
			const vf2 = sensors.f2.getValue(c.f2, psTC).psi;
			const vf2Decibar = SeaConvert.PSI2Decibar(vf2);
			const vf2Depth = SeaConvert.DECIBAR2Depth(vf2Decibar, c.lat);

			// -- vf1 S/m -- vf1 is different from SBEDataProc, E-04 ~ E-05, later on...
			// -- Frequency is same but Conductivity is different
			const vf1 = sensors.f1.getValue(c.f1, vf0, vf2Decibar).SPerM;
			// -- Salinity Practical, PSU is also a bit differ about 0.0001
			const vf1PSU = SeaConvert.COND2PSU(vf1, vf0, vf2Decibar);

			c.value = {
				f0: vf0,
				f1: vf1,
				f1psu: vf1PSU,
				f2: vf2,
				f2decibar: vf2Decibar,
				f2depth: vf2Depth
			}

			if (keyAltimeter) {
				const vAlti = c[keyAltimeter];
				const height = sensors[keyAltimeter].getValue(vAlti).meter;
				c.value.altimeter = height;
			}

			return c;
		}

		// {t1: 33.2, c1: 34.0, p: 1000...}
		parseRaw(lineNo) {
			// if(!this.related.xml) {
			// 	return undefined;
			// }

			const raw = this.getRaw(lineNo);
			const basic = this._parseBasic(raw);

			return basic;
		}

		parseDepthOnly(lineNo) {
			const raw = this.getRaw(lineNo);
			const depth = this._parseDepthOnly(raw);

			return depth;
		}

		// -- Parse only 9 bytes, t1, c1, p
		_parseBasic(ta) {
			const result = {};

			const desc = this.parsingDesc;
			// -- Byte index
			let b = 0;

			// -- Frequency
			for (let i = 0; i < desc.countFreq; i++) {
				result['f' + i] = ta[b++] * 256 + ta[b++] + ta[b++] / 256;
			}

			// -- Voltage - A/D - 3Bytes each
			const adWords = [];
			for (let i = 0; i < desc.countADWords; i++) {
				adWords.push((ta[b++] << 16) | (ta[b++] << 8) | ta[b++]);
			}

			// -- Voltage - 12 Bits each
			let adIndex = 0;
			adWords.forEach(bits => {
				result['v' + adIndex] = 5 * (1 - (bits >>> 12) / 4095);
				adIndex++;
				result['v' + adIndex] = 5 * (1 - (bits & 0x0FFF) / 4095);
				adIndex++;
			});

			// -- SurfacePar - 3Bytes
			if (desc.surfacePar) {
				b++; // unused 1 bytes
				const spBits = (ta[b++] << 8) | ta[b++];
				result['spV'] = (spBits & 0x0FFF) / 819;
			}

			// -- NMEA Position 7 byte
			if (desc.nmeaPosition) {
				let lat = (ta[b++] * 65536 + ta[b++] * 256 + ta[b++]) / 50000;
				let lng = (ta[b++] * 65536 + ta[b++] * 256 + ta[b++]) / 50000;

				const nmeaPosByte7 = ta[b++];
				if (1 === nmeaPosByte7 & 0b10000000) {
					lat = lat * -1;
				}

				if (1 === nmeaPosByte7 & 0b01000000) {
					lng = lng * -1;
				}

				result['lat'] = lat;
				result['lng'] = lng;
			}

			// -- NMEA Time 4 byte
			// -- Manual has no description about it.
			if (desc.nmeaTime) {
				const time = (ta[b++]) | (ta[b++] << 8) | (ta[b++] << 16) | (ta[b++] << 24);
				const dateMS = CTDHex.TIME_BASE_MS + time * 1000;
				result.date = new Date(dateMS);
				result.dateMS = dateMS;
			}

			// -- 3Bytes
			// -- Pressure Sensor Temperature
			// -- Manual says, this 3bytes located right after SurfacePar, but its not
			const ptBits = (ta[b++] << 8) | ta[b++];
			// -- Maybe they are using AD590 temperature
			// -- Pressure sensor temperature: 12-bit number is binary
			// representation of temperature, ranging from 0 to 4095
			// (2500 corresponds to approximately 22 ºC,
			// typical room temperature)
			// I guess : Celsius = f * M + B
			result['psT'] = ptBits >>> 4;
			result['CTDStatus'] = {
				pump: 0b0001 === (ptBits & 0b0001), // 1 Pump on, 0 Pump off
				bot: 0b0010 === (ptBits & 0b0010), // Bottom contact switch - 1 no contact, 0 switch closed
				ws: 0b0100 === (ptBits & 0b0100), // Water sampler, Deck unit detects confirm signal, or manual pump control
				cr: 0b1000 === (ptBits & 0b1000), // 0 Carrier Detected, 1 Carrier not detected
				s: (ptBits & 0x0F).toString(2).padStart(4, '0') // -- 1001
			}
			result['moduloCount'] = ta[b++];

			return result;
		}

		_parseDepthOnly(ta) {
			const result = {};

			const desc = this.parsingDesc;
			// -- Byte index
			let b = 0;

			// -- Frequency
			b = 6;
			result.f2 = ta[b++] * 256 + ta[b++] + ta[b++] / 256;
			b = desc.countFreq * 3;

			// -- Voltage - A/D - 3Bytes each
			b = b + (desc.countADWords * 3);

			// -- SurfacePar - 3Bytes
			if (desc.surfacePar) {
				b = b + 3;
			}

			// -- NMEA Position 7 byte
			if (desc.nmeaPosition) {
				let lat = (ta[b++] * 65536 + ta[b++] * 256 + ta[b++]) / 50000;
				let lng = (ta[b++] * 65536 + ta[b++] * 256 + ta[b++]) / 50000;

				const nmeaPosByte7 = ta[b++];
				if (1 === nmeaPosByte7 & 0b10000000) {
					lat = lat * -1;
				}

				if (1 === nmeaPosByte7 & 0b01000000) {
					lng = lng * -1;
				}

				result['lat'] = lat;
				result['lng'] = lng;
			}

			// -- NMEA Time 4 byte
			// -- Manual has no description about it.
			if (desc.nmeaTime) {
				b = b + 4;
			}

			// -- 3Bytes
			// -- Pressure Sensor Temperature
			const ptBits = (ta[b++] << 8) | ta[b++];
			result['psT'] = ptBits >>> 4;

			return result;
		}

		// -- Called sometimes..., before parsing, XML will call directly
		updateParsingDescription() {
			const xml = this.getXmlcon();

			if (!xml) {
				return;
			}

			const inst = xml.getInstrument();
			// -- Freq Word = 3 bytes each
			const countFreq = 5 - inst.freqSuppress;
			// -- AD Word = 3 bytes each
			const countAD = 8 - inst.voltSuppress;
			const countADWords = countAD / 2;

			const surfacePar = 1 === inst.surfacePar;
			const nmeaPosition = 1 === inst.nmeaPosition;
			const nmeaDepth = 1 === inst.nmeaDepth;
			const nmeaTime = 1 === inst.nmeaTime;
			const scanTime = 1 === inst.scanTime;

			this.parsingDesc = {
				countFreq: countFreq,
				countAD: countAD,
				countADWords: countADWords,
				surfacePar: surfacePar,
				nmeaPosition: nmeaPosition,
				nmeaDepth: nmeaDepth,
				nmeaTime: nmeaTime,
				scanTime: scanTime,
				scanAvg: inst.scanAvg
			}
		}

		getLength() {
			return this.bodyLength;
		}

		getParsingDescription() {
			return this.parsingDesc;
		}

		getParsedHDR() {
			return this.parsedHDR;
		}

		// -- header remains
		unload() {
			this.body = undefined;
			// this.dataSource = undefined;
		}

		parseMeta() {
			if (!this.parsedHDR) {
				console.error('hdr should parsed before');
				return;
			}

			const parseDesc = this.getParsingDescription();
			const descStr = Object.keys(parseDesc).map(k => `${k}: ${parseDesc[k]}`).join(', ');

			const meta = {};

			meta.lat = this.parsedHDR.lat;
			meta.lng = this.parsedHDR.lng;
			meta.ts = this.parsedHDR.utc;
			meta.ms = meta.ts.getTime();
			meta.count = this.getLength();
			meta.desc = descStr;
			meta.bytes = this.bytes;

			this.meta = meta;
			return meta;
		}

		getMeta() {
			return this.meta;
		}

		static GetMetaDesc() {
			return {
				lat: 'HEX HDR string NMEA Latitude = lat',
				lng: 'HEX HDR string NMEA Longitude = lng',
				ts: 'HEX HDR string NMEA UTC (Time) = ts',
				ms: 'HEX HDR string NMEA UTC (Time) = ts to ms',
				count: 'HEX getLength()',
				desc: 'HEX getParsingDescription()',
				bytes: 'HEX content-length header or file.size'
			}
		}

	}

	class CTDXMLCON extends CTDChild {
		// -- getValue unit is very important so it returns with unit
		static SENSOR_MAP = [
			{
				sensorID: 3,
				attribute: 'ConductivitySensor',
				title: 'Conductivity',
				coef: {
					CPcor: 'Coefficients[1].CPcor',
					CTcor: 'Coefficients[1].CTcor',
					G: 'Coefficients[1].G',
					H: 'Coefficients[1].H',
					I: 'Coefficients[1].I',
					J: 'Coefficients[1].J',
					WBOTC: 'Coefficients[1].WBOTC',
				},
				// -- t : temperature Degree Celsius
				// -- p : pressure decibars
				getValue: (coef, f, t, p) => {
					const fk = f / 1000;
					const sPerM1 = coef.G + coef.H * Math.pow(fk, 2) + coef.I * Math.pow(fk, 3) + coef.J * Math.pow(fk, 4);
					const sPerM2 = 1 + coef.CTcor * t + coef.CPcor * p;
					const sPerM = sPerM1 / 10 * sPerM2;
					return { SPerM: sPerM };
				},
			},
			{
				sensorID: 55,
				attribute: 'TemperatureSensor',
				title: 'Temperature',
				coef: ['F0', 'G', 'H', 'I', 'J', 'Offset', 'Slope', 'UseG_J'],
				getValue: (coef, f) => {
					const ff = coef.F0 / f;
					const log = Math.log(ff);

					let v = 1 / (coef.G + coef.H * (log) + coef.I * Math.pow(log, 2) + coef.J * Math.pow(log, 3)) - 273.15;
					return { DegreeC: v };
				}
			},
			{
				sensorID: 45,
				attribute: 'PressureSensor',
				title: 'Pressure',
				coef: ['AD590B', 'AD590M', 'C1', 'C2', 'C3', 'D1', 'D2', 'Offset', 'Slope', 'T1', 'T2', 'T3', 'T4', 'T5'],
				// -- u - Temperature at pressure sensor in degree celsius
				getValue: (coef, f, u) => {
					const C = coef.C1 + coef.C2 * u + coef.C3 * Math.pow(u, 2);
					const D = coef.D1 + coef.D2 * u;
					const T0 = coef.T1 + coef.T2 * u + coef.T3 * Math.pow(u, 2) + coef.T4 * Math.pow(u, 3) + coef.T5 * Math.pow(u, 4);

					// -- Frequency to microseconds period
					const T = (1 / f) * (1000 * 1000);

					const P1 = 1 - (Math.pow(T0, 2) / (Math.pow(T, 2)));
					const P2 = 1 - (D * (1 - (Math.pow(T0, 2) / Math.pow(T, 2))));
					const P = C * P1 * P2;

					return { psia: P, psi: P - 14.7 }; // psia - Pounds per square inch absolute
				}

			},
			{
				sensorID: 38,
				attribute: 'OxygenSensor',
				title: 'Oxygen',
				coef: {
					A: 'CalibrationCoefficients[1].A',
					B: 'CalibrationCoefficients[1].B',
					C: 'CalibrationCoefficients[1].C',
					D0: 'CalibrationCoefficients[1].D0',
					D1: 'CalibrationCoefficients[1].D1',
					D2: 'CalibrationCoefficients[1].D2',
					E: 'CalibrationCoefficients[1].E',
					H1: 'CalibrationCoefficients[1].H1',
					H2: 'CalibrationCoefficients[1].H2',
					H3: 'CalibrationCoefficients[1].H3',
					Soc: 'CalibrationCoefficients[1].Soc',
					Tau20: 'CalibrationCoefficients[1].Tau20',
					offset: 'CalibrationCoefficients[1].offset',
				}
			},
			{
				sensorID: 71,
				attribute: 'WET_LabsCStar',
				title: 'Transmissometer',
				coef: ['B', 'M', 'PathLength']
			},
			{
				sensorID: 20,
				attribute: 'FluoroWetlabECO_AFL_FL_Sensor',
				title: 'Fluorometer',
				coef: ['ScaleFactor', 'Vblank']
			},
			{
				sensorID: 42,
				attribute: 'PAR_BiosphericalLicorChelseaSensor',
				title: 'PAR_Biospherical',
				coef: ['B', 'M', 'Multiplier', 'Offset']
			},
			{
				sensorID: 0,
				attribute: 'AltimeterSensor',
				title: 'Altimeter',
				coef: ['ScaleFactor', 'Offset'],
				getValue: (coef, v) => {
					return { meter: (v * 300 / coef.ScaleFactor) + coef.Offset };
				}
			},
			{
				sensorID: 27,
				attribute: 'NotInUse',
				title: 'NotInUse'
			}
		];

		constructor() {
			super();
			this.file = undefined;
			this.dataSource = undefined;

			// -- my sensor map
			this.parsedMap = {
				f0: undefined, // -- Primary Temperature
				f1: undefined, // -- Primary Conductivty
				f2: undefined, // -- Pressure
				f3: undefined, // -- Secondary Temperature -- Optional
				f4: undefined, // -- Secondary Conductivity -- Optional
				v0: undefined,
				v1: undefined,
				v2: undefined,
				v3: undefined,
				v4: undefined,
				v5: undefined,
				v6: undefined,
				v7: undefined,
			}
		}

		static parseXml(str) {
			var dom = null;
			if (window.DOMParser) {
				try {
					dom = (new DOMParser()).parseFromString(str, "text/xml");
				}
				catch (e) { dom = null; }
			}

			return dom;
		}

		// Changes XML to JSON -- https://davidwalsh.name/convert-xml-json
		static xmlToJson(xml) {
			// Create the return object
			var obj = {};

			if (xml.nodeType == 1) { // element
				// do attributes
				if (xml.attributes.length > 0) {
					obj["@attributes"] = {};
					for (var j = 0; j < xml.attributes.length; j++) {
						var attribute = xml.attributes.item(j);
						obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
					}
				}
			} else if (xml.nodeType == 3) { // text
				obj = xml.nodeValue;
			}

			// do children
			if (xml.hasChildNodes()) {
				for (var i = 0; i < xml.childNodes.length; i++) {
					var item = xml.childNodes.item(i);
					var nodeName = item.nodeName;
					if (typeof (obj[nodeName]) == "undefined") {
						obj[nodeName] = CTDXMLCON.xmlToJson(item);
					} else {
						if (typeof (obj[nodeName].push) == "undefined") {
							var old = obj[nodeName];
							obj[nodeName] = [];
							obj[nodeName].push(old);
						}
						obj[nodeName].push(CTDXMLCON.xmlToJson(item));
					}
				}
			}
			return obj;
		};

		static parseCTDXMLConfig(json) {
			const list = [];
			try {
				json.SBE_InstrumentConfiguration.Instrument.SensorArray.Sensor.forEach((s, key) => {
					const item = CTDXMLCON.parseSensor(s);
					if (item) {
						item.key = key; // -- Order
						list.push(item);
					}
				});
			} catch (e) {
				console.log(e);
			}

			return list;
		}

		static parseSensor(sensor) {
			const id = sensor['@attributes'].SensorID;
			// -- NotInUse - 27
			// if('27' === id) {
			// 	return false;
			// }

			const found = CTDXMLCON.SENSOR_MAP.find(item => item.sensorID == id); // int vs string
			if (!found) {
				console.warn(`CTDXMLCON.parseSensor sensor ID not found ${id}`);
				return false;
			}

			const child = sensor[found.attribute];
			const serial = child.SerialNumber['#text'];
			let calibration = child.CalibrationDate['#text'];
			if (!calibration) {
				calibration = '';
			}

			// -- Coefficients
			let coef = undefined;
			if (found.coef) {
				if ('function' === typeof found.coef) {
					coef = found.coef(child);
				} else if ('object' === typeof found.coef) {
					coef = {};

					// -- Array type
					if (Array.isArray(found.coef)) {
						found.coef.forEach(name => {
							// -- req Misc.js
							const value = getValueFromObject(child, name);
							if (!value || !value.hasOwnProperty('#text')) {
								console.error(`CTDXMLCON.parseSensor Invalid Coef`);
								console.error(name);
							} else {
								coef[name] = parseFloat(value['#text']);
							}
						});
					} else {
						// Object Type
						Object.keys(found.coef).forEach(name => {
							const exp = found.coef[name];
							const value = getValueFromObject(child, exp);
							if (!value || !value.hasOwnProperty('#text')) {
								console.error(`CTDXMLCON.parseSensor Invalid Coef`);
								console.error(name);
							} else {
								coef[name] = parseFloat(value['#text']);
							}
						});
					}
				}
			}

			// -- getValue function
			let getValue = undefined;
			if (found.getValue && 'function' === typeof found.getValue) {
				getValue = (...args) => found.getValue(coef, ...args);
			}

			return {
				id: id,
				type: found.title,
				serial: serial,
				calibration: calibration,
				coef: coef,
				getValue: getValue
			}
		}

		async setFile(file) {
			const text = await file.text();
			this.setDataSource(text);
			this.bytes = file.size;
		}

		async setFileURL(url) {
			const r = await fetch(url);
			const bytes = r.headers.get('content-length');
			const text = await r.text();
			this.setDataSource(text);
			this.bytes = parseInt(bytes);
		}

		setDataSource(dataSource) {
			const xml = CTDXMLCON.parseXml(dataSource);
			const json = CTDXMLCON.xmlToJson(xml);
			this.dataSource = json;
			this.parsed = CTDXMLCON.parseCTDXMLConfig(json);

			// -- instrument description
			const inst = json.SBE_InstrumentConfiguration.Instrument;
			this.instrument = {
				// -- suppressed 0 -> freq count = 5 - 0, 3bytes * 5 = 15 bytes used
				freqSuppress: parseInt(inst.FrequencyChannelsSuppressed['#text']),

				// -- suppressed 0 -> volt count = 8 - 0, 12bits * 8 = 96 bits = 12 bytes
				voltSuppress: parseInt(inst.VoltageWordsSuppressed['#text']),

				nmeaDepth: parseInt(inst.NmeaDepthDataAdded['#text']),
				nmeaPosition: parseInt(inst.NmeaPositionDataAdded['#text']),
				nmeaTime: parseInt(inst.NmeaTimeAdded['#text']),
				scanTime: parseInt(inst.ScanTimeAdded['#text']),
				// -- 3 bytes for surfacePar channel
				surfacePar: parseInt(inst.SurfaceParVoltageAdded['#text']),
				scanAvg: parseInt(inst.ScansToAverage['#text'])
			};

			// -- this.parsedMap, order critical
			['f0', 'f1', 'f2', 'f3', 'f4', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].forEach((name, i) => {
				const s = this.getSensorAt(i);

				// -- NotInUse
				if (s && 'NotInUse' !== s.type) {
					this.parsedMap[name] = s;
				}
			});

			// -- Update hex parsing description
			const hex = this.getHex();
			if (hex) {
				hex.updateParsingDescription();
			}
		}

		parseMeta() {
			if (!this.dataSource) {
				console.error('Required dataSource json from xml');
				return false;
			}

			const meta = {};
			const inst = this.dataSource.SBE_InstrumentConfiguration.Instrument;

			meta.eq = inst.Name['#text'];
			const pressure = inst.SensorArray.Sensor.find(d => '45' === d['@attributes'].SensorID);
			meta.eqid = pressure.PressureSensor.SerialNumber['#text'];
			meta.bytes = this.bytes;

			this.meta = meta;
			return this.meta;
		}

		getMeta() {
			return this.meta;
		}

		static GetMetaDesc() {
			return {
				eq: 'XMLCON.Instrument.Name',
				eqid: 'XMLCON.Instrument.SensorArray.Sensor.SensorID == 45 serial',
				bytes: 'XMLCON content-length header or file.size'
			}
		}

		getInstrument() {
			return this.instrument;
		}

		getSensorAt(no) {
			if (!this.parsed) {
				console.error(`CTDXMLCON.getSensorAt Not yet parsed ${no}`);
				return undefined;
			}

			if (no < this.parsed.length) {
				return this.parsed[no];
			}

			return undefined;
		}

		/**
		 * { f0: getSensorAt(0), f1:... f3: undefined, v0 ~ }
		 */
		getParsedMap() {
			return this.parsedMap;
		}

		// -- return key like f1, v3
		findSensorKeyByType(type) {
			const map = this.getParsedMap();
			if (!map) {
				console.log(`CTDXmlcon.findSensorType : no xml parsed`);
				return false;
			}

			let result = undefined;
			Object.keys(map).forEach(key => {
				const s = map[key];
				if (!s) {
					return;
				}

				if (type === s.type) {
					result = key;
				}
			});

			return result;
		}
	}

	class SeaConvert {
		static D = '&deg;'; // -- Degree
		static DC = `&deg;C`; // -- Degree Celsius
		static SpM = 'S/m';
		static PSU = 'PSU';
		static M = 'm';
		static MpS = 'm/s';

		static PSI2Decibar(psi) {
			return psi * 0.689476;
		}

		static DECIBAR2Depth(p, lat) {
			let x, d, gr;
			x = Math.sin(lat / 57.29578);
			x = x * x;
			gr = 9.780318 * (1.0 + (5.2788e-3 + 2.36e-5 * x) * x) + 1.092e-6 * p;
			d = (((-1.82e-15 * p + 2.279e-10) * p - 2.2512e-5) * p + 9.72659) * p;
			if (gr) {
				d /= gr;
			}

			return d;
		}

		// -- C: Conductivity S/m, T: Temperature in Degree celsius, P: pressure in decibars
		static COND2PSU(C, T, P) {
			const A1 = 2.070e-5, A2 = -6.370e-10, A3 = 3.989e-15, B1 = 3.426e-2, B2 = 4.464e-4, B3 = 4.215e-1;
			const B4 = -3.107e-3, C0 = 6.766097e-1, C1 = 2.00564e-2, C2 = 1.104259e-4, C3 = -6.9698e-7, C4 = 1.0031e-9;
			const a = [0.0080, -0.1692, 25.3851, 14.0941, -7.0261, 2.7081];
			const b = [0.0005, -0.0056, -0.0066, -0.0375, 0.0636, -0.0144];

			let R, RT, RP, temp, sum1, sum2, result, val;
			let i;

			if (C <= 0) {
				return 0;
			}

			C = C * 10.0; // S/M to mmhos/cm
			R = C / 42.914;

			val = 1 + B1 * T + B2 * T * T + B3 * R + B4 * R * T;
			if (val) {
				RP = 1 + (P * (A1 + P * (A2 + P * A3))) / val;
			}
			val = RP * (C0 + (T * (C1 + T * (C2 + T * (C3 + T * C4)))));
			if (val) {
				RT = R / val;
			}
			if (RT <= 0.0) {
				RT = 0.000001;
			}
			sum1 = sum2 = 0.0;

			for (i = 0; i < 6; i++) {
				temp = Math.pow(RT, i / 2.0);
				sum1 += a[i] * temp;
				sum2 += b[i] * temp;
			}
			val = 1.0 + 0.0162 * (T - 15.0);
			if (val) {
				result = sum1 + sum2 * (T - 15.0) / val;
			} else {
				result = -99.0;
			}

			return result;
		}

		/**
		 * 
		 * @param {*} s : salinity in PSU
		 * @param {*} t : temperature in deg C
		 * @param {*} p : presure in decibar
		 */
		static SVChenMillero(s, t, p0) {
			let a, a0, a1, a2, a3;
			let b, b0, b1;
			let c, c0, c1, c2, c3;
			let p, sr, d, sv;

			p = p0 / 10.0; /* scale pressure to bars */
			if (s < 0.0) s = 0.0;
			sr = Math.sqrt(s);
			d = 1.727e-3 - 7.9836e-6 * p;
			b1 = 7.3637e-5 + 1.7945e-7 * t;
			b0 = -1.922e-2 - 4.42e-5 * t;
			b = b0 + b1 * p;
			a3 = (-3.389e-13 * t + 6.649e-12) * t + 1.100e-10;
			a2 = ((7.988e-12 * t - 1.6002e-10) * t + 9.1041e-9) * t - 3.9064e-7;
			a1 = (((-2.0122e-10 * t + 1.0507e-8) * t - 6.4885e-8) * t - 1.2580e-5) * t + 9.4742e-5;
			a0 = (((-3.21e-8 * t + 2.006e-6) * t + 7.164e-5) * t - 1.262e-2) * t + 1.389;
			a = ((a3 * p + a2) * p + a1) * p + a0;
			c3 = (-2.3643e-12 * t + 3.8504e-10) * t - 9.7729e-9;
			c2 = (((1.0405e-12 * t - 2.5335e-10) * t + 2.5974e-8) * t - 1.7107e-6) * t + 3.1260e-5;
			c1 = (((-6.1185e-10 * t + 1.3621e-7) * t - 8.1788e-6) * t + 6.8982e-4) * t + 0.153563;
			c0 = ((((3.1464e-9 * t - 1.47800e-6) * t + 3.3420e-4) * t - 5.80852e-2) * t + 5.03711) * t + 1402.388;
			c = ((c3 * p + c2) * p + c1) * p + c0;
			sv = c + (a + b * sr + d * s) * s;
			return sv;
		}

		static PrettyDepth(v, d = 1, pad, space) {
			return SeaConvert.PrettyPrint(v, SeaConvert.M, d, pad, space);
		}

		static PrettyTemp(v, d, pad, space) {
			return SeaConvert.PrettyPrint(v, SeaConvert.DC, d, pad, space);
		}

		static PrettySal(v, d, pad, space) {
			return SeaConvert.PrettyPrint(v, SeaConvert.PSU, d, pad, space);
		}

		static PrettyPrint(v, unit, d = 4, pad = true, space = true) {
			const rounded = SeaConvert.Round(v, d);
			let str = '';
			if (pad) {
				str = rounded.toFixed(d);
			} else {
				str = String(rounded);
			}

			if (space) {
				str = str + ' ';
			}

			if (unit) {
				str = str + unit;
			}

			return str;
		}

		static PrettySensor(sensor, length = 3) {
			if (0 === length) {
				return sensor.type + ' ' + sensor.serial;
			}

			return sensor.type.slice(0, length) + ' ' + sensor.serial;
		}

		static Round(num, d) {
			const ep = 'e+' + d;
			const em = 'e-' + d;
			return +(Math.round(num + ep) + em);
		}
	}

	class SeaParser {
		constructor() {
			this.group = undefined;
			this.hex = undefined;
			this.xmlcon = undefined;
			this.sensors = undefined;
		}

		// -- Set datasource
		setGroup(group) {
			this.group = group;

			this.setHex(group.getHex());
			this.setXmlcon(group.getXmlcon());
		}

		setHex(hex) {
			this.hex = hex;
		}

		setXmlcon(xmlcon) {
			this.xmlcon = xmlcon;
			this.sensors = xmlcon.getParsedMap();
		}
		/*
			* 1. from pump on to pump off or surface, can be plural
			* [[start, end], [start, end]]
			*/

		// -- Parse
		/**
		 * down / up cast - divided by maximum depth
		 * returns idx loop
		 * d : [start, end]
		 * u : [start, end]
		 */
		parseDownUp(countSample) {
			if (!this.hex || !this.xmlcon) {
				console.error(`SeaParser.parseBrief no hex or no xmlcon`);
				return false;
			}

			const len = this.hex.getLength();

			if (!countSample) {
				countSample = parseInt(len / 10);
			}
			let argCountSample = countSample;

			let s = 0, e = len, inc = 0;
			let r = null;
			let breakC = 0;

			// -- Usually loop just 2 times
			while (countSample === argCountSample) {
				inc = parseInt((e - s) / countSample);
				inc = inc < 1 ? 1 : inc;

				// -- r : hex idx
				r = this._loopInF2(s, e, inc);
				// console.log(r);

				let nextS = Math.floor(r - (countSample / 2));
				let nextE = Math.ceil(r + (countSample / 2));

				s = nextS < s ? s : nextS;
				e = nextE > e ? e : nextE;

				if (countSample > (e - s)) {
					countSample = e - s;
				}

				breakC++;

				if (breakC > 100) {
					console.error(`Invalid condition, program in infinite loop`);
					break;
				}
			}

			const result = {
				d: [0, r],
				u: [r + 1, len - 1]
			}

			return result;
		}

		_loopInF2(is, ie, inc) {
			let maxDepth = -999;
			let maxDepthIdx = -1;

			// console.log(`Loop ${is} ~ ${ie} (${ie - is}) + ${inc}`);

			for (let i = is; i <= ie; i = i + inc) {
				const c = this.hex.parseDepthOnly(i);

				// const psTC = c.psT * this.sensors.f2.coef.AD590M + this.sensors.f2.coef.AD590B;
				// const vf2 = this.sensors.f2.getValue(c.f2, psTC).psi;
				// const vf2Decibar = SeaConvert.PSI2Decibar(vf2);
				// const vf2Depth = SeaConvert.DECIBAR2Depth(vf2Decibar, c.lat);

				if (maxDepth < c.f2) {
					maxDepth = c.f2;
					maxDepthIdx = i;
				}
			}

			return i;
		}

		parseDepthTest() {
			const len = this.hex.getLength();

			let maxRaw = -1, maxDepth = -1;
			let maxObj1 = undefined;
			let maxObj2 = undefined;

			const s1 = new Date().getTime();
			for (let i = 0; i < len; i++) {
				const c = this.hex.parseRaw(i);

				if (maxRaw < c.f2) {
					maxRaw = c.f2;
					maxObj1 = c;
				}
			}
			const rawMS = new Date().getTime() - s1;

			const s2 = new Date().getTime();
			for (let i = 0; i < len; i++) {
				const c = this.hex.parseDepthOnly(i);

				if (maxDepth < c.f2) {
					maxDepth = c.f2;
					maxObj2 = c;
				}
			}
			const depthMS = new Date().getTime() - s2;

			console.log(`count: ${len}, rawMS: ${rawMS}, depthMS: ${depthMS}`);
			console.log(`maxRaw ${maxRaw}, maxDepth ${maxDepth}`);
			console.log(maxObj1, maxObj2);
		}

		parseTest() {
			this.parseDownUp();
			this.parseDepthTest();
		}

	}

	return {
		CTDFileList: CTDFileList,
		CTDGroup: CTDGroup,
		CTDChild: CTDChild,
		CTDHex: CTDHex,
		CTDXMLCON: CTDXMLCON,

		SeaConvert: SeaConvert,
		SeaParser: SeaParser,
	}

})();