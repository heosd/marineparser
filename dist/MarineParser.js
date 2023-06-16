
const MarineParser = (() => {
	const ParserA = (() => {
	const TypeMap = {
		U1: ["getUint8", 1],
		U2: ["getUint16", 2],
		U4: ["getUint32", 4],
		U8: ["getBigUint64", 8],
		I1: ["getInt8", 1],
		I2: ["getInt16", 2],
		I4: ["getInt32", 4],
		I8: ["getBigInt64", 8],
		F4: ["getFloat32", 4],
		F8: ["getFloat64", 8]
	};

	function GetTypeSize(strType) {
		if (TypeMap[strType]) {
			return TypeMap[strType][1];
		} else if ('A' === strType[0]) {
			const m = strType.match(/^A(\d+)$/);
			if (!m) {
				return -1;
			}

			const asciiByte = parseInt(m[1]);
			if (isNaN(asciiByte)) {
				return -1;
			}

			return asciiByte;
		}

		return -1;
	}

	function CreateReader(struct) {
		const obj = {};
		let offset = 0;

		// -- additional attribute or function should start with _
		// -- this is kind of static method
		// obj._getSize = GetTypeSize;

		struct.forEach((value, key) => {
			const found = TypeMap[value];
			const co = offset;

			if (found) {
				const fn = found[0];

				obj[key] = (dv, baseOffset, littleEndian) => {
					// console.log(`getting[${key}] - bo: ${baseOffset}, co : ${co} = ${baseOffset + co}`);
					return dv[fn](baseOffset + co, false === littleEndian ? false : true);
				};

				offset = offset + found[1];
			} else {
				// -- not on list like A16 means Ascii 16 byte
				if ('A' === value[0]) {
					const asciiByte = GetTypeSize(value);
					if (-1 === asciiByte) {
						console.error(`Invalid Ascii type, that should have number after A like A16`);
						return;
					}

					obj[key] = (dv, baseOffset) => {
						const start = dv.byteOffset + baseOffset + co;
						const ab = dv.buffer.slice(start, start + asciiByte);
						return String.fromCharCode.apply(null, new Uint8Array(ab));
					}

					offset = offset + asciiByte;
				}
				// -- other type can be added here
			}
		});

		// -- order critical, should be located after struct foreach
		obj._size = offset;

		/**
		 * help function to read data easily, save values to result
		 *  const result = {};
		 *  ParserEM.EMParamInstall.ReadInstall.toObject(
		 *    dataView,
		 *    offset,
		 *    ["length", "type", "model", "serial"],
		 *    result
		 *  );
		 **/
		obj._toObject = (dv, baseOffset, arrayKeys, resultObject, littleEndian) => {
			arrayKeys.forEach((key) => {
				resultObject[key] = obj[key](dv, baseOffset, littleEndian);
			});
		};

		// use in description, detail with all data but slower
		obj._toDescribeMap = (dv, baseOffset, resultMap, littleEndian) => {
			struct.forEach((dataType, key) => {
				const valueRead = obj[key](dv, baseOffset, littleEndian);
				const dataSize = GetTypeSize(dataType);
				const desc = Describe(valueRead, dataType, dataSize);
				resultMap.set(key, desc);
			});
		};

		// // created Reader to combine with DataView
		// // header = PD0Header.ReadHeader._withDataView(dataView, 2400, true);
		// // const value = header.hID;
		// obj._withDataView = (dv, baseOffset, littleEndian) => {
		// 	const newObj = {};
		// 	struct.forEach((_, k) => {
		// 		Object.defineProperty(newObj, k, {
		// 			get() {
		// 				return obj[k](dv, baseOffset, littleEndian);
		// 			}
		// 		});
		// 	});

		// 	return newObj;
		// }

		return obj;
	}

	function ParseAscii(dataView, start, end) {
		// -- Using buffer directly, this.byteOffset should be added, otherwise it will start from the 0
		const ab = dataView.buffer.slice(dataView.byteOffset + start, dataView.byteOffset + end);
		return String.fromCharCode.apply(null, new Uint8Array(ab));
	}

	function Describe(valueRead, dataType, dataSize) {
		return {
			v: valueRead,
			type: dataType,
			size: dataSize
		}
	}

	function Undescribe(map) {
		const obj = {};
		for (const [k, v] of map.entries()) {
			obj[k] = v.v;
		}

		return obj;
	}

	function UndescribeMap(map) {
		for (const [k, v] of map.entries()) {
			map.set(k, v.v);
		}

		return map;
	}

	function ParseBit(listBit, value) {
		const result = [];
		listBit.forEach(b => {
			if (0 < (b[0] & value)) {
				result.push(b);
			}
		});

		return result;
	}

	function ParseBitEqual(listBit, value) {
		const result = [];
		listBit.forEach(b => {
			const masked = value & b[0];
			if (masked === b[1]) {
				result.push(b);
			}
		});

		return result;
	}

	function ParsedBitJoin(arr) {
		return arr.map(d => d.at(-1)).join(', ');
	}

	// -- project functions to obj
	function Project(obj) {
		for(const [k, v] of Object.entries(returnObj)) {
			obj[k] = v;
		}
	}

	const returnObj = {
		// Parser A
		TypeMap: TypeMap,
		GetTypeSize: GetTypeSize,
		CreateReader: CreateReader,
		ParseAscii: ParseAscii,

		Describe: Describe,
		Undescribe: Undescribe,
		UndescribeMap: UndescribeMap,
		
		// Parser B
		ParseBit: ParseBit,
		ParseBitEqual: ParseBitEqual,
		ParsedBitJoin: ParsedBitJoin,

		// method
		Project: Project,
	};

	return returnObj;
})();

// Requires ParserA

const ParserEM = (() => {
	class EMAll extends DataView {
		#littleEndian = true;

		static STX = 0x02;
		static ETX = 0x03;

		static BYTE_LENGTH = 4;

		static DATAGRAM_TYPES = {
			0x49: { title: "Install Start", cls: null },
			0x69: { title: "Install Stop", cls: null },
			0x70: { title: "Install Remote", cls: null },
			0x52: { title: "Runtime", cls: null },
			0x58: { title: "XYZ88", cls: null },
			0x4b: { title: "Central Beams", cls: null },
			0x46: { title: "Raw range and Beam angle", cls: null },
			0x66: { title: "Raw range and Beam angle F", cls: null },
			0x4e: { title: "Raw range and angle 78", cls: null },
			0x53: { title: "Seabed image", cls: null },
			0x59: { title: "Seabed image 89", cls: null },
			0x6b: { title: "Water column", cls: null },
			0x4f: { title: "Quality factor 79", cls: null },
			0x41: { title: "Attitude", cls: null },
			0x6e: { title: "Network attitude velocity", cls: null },
			0x43: { title: "Clock", cls: null },
			0x68: { title: "Depth or height", cls: null },
			0x48: { title: "Heading", cls: null },
			0x50: { title: "Position", cls: null },
			0x45: { title: "Single beam echo sounder depth", cls: null },
			0x54: { title: "Tide", cls: null },
			0x47: { title: "Surface sound speed", cls: null },
			0x55: { title: "Sound speed profile", cls: null },
			0x57: { title: "Kongberg Maritime SSP output", cls: null },
			0x4a: { title: "Mechanical transducer tilt", cls: null },
			0x33: { title: "Extra parameters 3", cls: null },
			0x30: { title: "PU ID output", cls: null },
			0x31: { title: "PU Status output", cls: null },
			0x42: { title: "PU BIST result output", cls: null },
			0x44: { title: "Depth datagram", cls: null } // -- Onnuri data got no XYZ88 but this
		};

		static DescType(type) {
			return EMAll.DATAGRAM_TYPES[type]?.title ?? undefined;
		}

		set littleEndian(bool) {
			this.#littleEndian = bool;
		}

		parseBrief() {
			//console.log("LEN", this.byteLength);

			const sections = [];
			let offset = 0;

			while (offset < this.byteLength) {
				const s = this.parseSection(offset);
				sections.push(s);

				offset = offset + s.len + EMAll.BYTE_LENGTH;
			}

			return sections;
		}

		// -- Divide section, type
		parseSection(startOffset) {
			const len = this.getUint32(startOffset, this.#littleEndian);
			const stx = this.getUint8(startOffset + 4, this.#littleEndian);
			const type = this.getUint8(startOffset + 5, this.#littleEndian);

			const r = {
				type: type,
				offset: startOffset,
				len: len,

				valid: false
			};

			if (EMAll.STX === stx) {
				r.valid = true;
			}

			return r;
		}
	}

	class EMXYZ88 {
		static TYPES = [0x58, 0x88];
		static IsMyType(type) {
			return -1 < EMXYZ88.TYPES.findIndex(d => d === type);
		}

		static STRUCT_XYZ_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"],
			["serial", "U2"],
			["heading", "U2"],
			["ss", "U2"],
			["txTRDepth", "F4"], // meter
			["numBeams", "U2"],
			["numValid", "U2"],
			["freq", "F4"], // Hz, Sampling frequency
			["info", "U1"], // Scanning info
			["spare01", "U1"],
			["spare02", "U1"],
			["spare03", "U1"]
		]);

		static STRUCT_XYZ_BODY = new Map([
			["z", "F4"], // Depth in meter
			["y", "F4"], // Acrosstrack, STBD Port in meter
			["x", "F4"], // Alongtrack, Stern Ahead in meter
			["windowLen", "U2"],
			["QFac", "U1"],
			["angAdj", "I1"],
			["dInfo", "U1"], // Detection information
			["cInfo", "I1"], // real time Cleaning information
			["reflectivity", "I2"] // 0.1dB
		]);

		static STRUCT_XYZ_TAIL = new Map([
			["spare04", "U1"],
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMXYZ88.STRUCT_XYZ_HEAD);
		static ReadBody = ParserA.CreateReader(EMXYZ88.STRUCT_XYZ_BODY);
		static ReadTail = ParserA.CreateReader(EMXYZ88.STRUCT_XYZ_TAIL);

		static ParseSection(dataView, offset, littleEndian) {
			const result = {};
			// -- S as section parser
			const S = EMXYZ88;

			// -- read numBeams
			const numBeams = S.ReadHead.numBeams(dataView, offset, littleEndian);

			const date = S.ReadHead.date(dataView, offset, littleEndian);
			const time = S.ReadHead.time(dataView, offset, littleEndian);

			const dt = ParseDateTime(date, time);
			// console.log(`Date : ${dt}, num of beams : ${numBeams}`);

			result.dt = dt;
			result.numBeams = numBeams;

			// -- read z at body
			const offsetBody = S.ReadHead._size + offset;
			const body = [];
			for (let j = 0; j < numBeams; j++) {
				const offsetCurrentBody = offsetBody + j * S.ReadBody._size;
				const x = S.ReadBody.x(dataView, offsetCurrentBody, littleEndian);
				const y = S.ReadBody.y(dataView, offsetCurrentBody, littleEndian);
				const z = S.ReadBody.z(dataView, offsetCurrentBody, littleEndian);
				body.push([x, y, z]);
			}

			result.body = body;

			const lengthBody = numBeams * S.ReadBody._size;
			const offsetTail = offsetBody + lengthBody;
			const etx = S.ReadTail.etx(dataView, offsetTail, littleEndian);

			result.etxValid = EMAll.ETX === etx;

			return result;
		}

		// [date, time, numBeams, txTRDepth, [body]]
		static ParseSectionMinimum(dataView, offset, littleEndian) {
			const result = [
				EMXYZ88.ReadHead.date(dataView, offset, littleEndian),
				EMXYZ88.ReadHead.time(dataView, offset, littleEndian),
				EMXYZ88.ReadHead.numBeams(dataView, offset, littleEndian),
				EMXYZ88.ReadHead.txTRDepth(dataView, offset, littleEndian),
			];

			const offsetBody = EMXYZ88.ReadHead._size + offset;
			const body = [];
			for (let j = 0; j < result[2]; j++) {
				const offsetCurrentBody = offsetBody + j * EMXYZ88.ReadBody._size;
				const x = EMXYZ88.ReadBody.x(dataView, offsetCurrentBody, littleEndian);
				const y = EMXYZ88.ReadBody.y(dataView, offsetCurrentBody, littleEndian);
				const z = EMXYZ88.ReadBody.z(dataView, offsetCurrentBody, littleEndian);
				body.push([x, y, z]);
			}

			result.push(body);

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMXYZ88.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			let seq = EMXYZ88.ReadHead._size;
			const num = result.get('numBeams').v;

			for (let i = 0; i < num; i++) {
				const seqOffset = seq + (EMXYZ88.ReadBody._size * i);
				const entry = new Map();
				EMXYZ88.ReadBody._toDescribeMap(dataView, seqOffset, entry, littleEndian);

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			seq = seq + (EMXYZ88.ReadBody._size * num);
			EMXYZ88.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMParamInstall {
		static TYPES = [0x49, 0x69, 0x70];
		static IsMyType(type) {
			return -1 < EMParamInstall.TYPES.findIndex(d => d === type);
		}

		static STRUCT_INSTALL = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["lineNo", "U2"],
			["serial", "U2"],
			["serial2ndSonar", "U2"]
		]);

		static ReadInstall = ParserA.CreateReader(EMParamInstall.STRUCT_INSTALL);

		static ParseSection(dataView, offset, littleEndian) {
			const result = {};

			EMParamInstall.ReadInstall._toObject(
				dataView,
				offset,
				["length", "type", "model", "serial"],
				result,
				littleEndian
			);

			// -- result.ascii
			const size = EMParamInstall.ReadInstall._size;
			const start = offset + size;
			const end = start + result.length - size; // then starts 00 03 which is ETX

			const ascii = ParserA.ParseAscii(dataView, start, end);
			result.ascii = ascii;

			// -- result.etxValid
			result.etxValid = false;
			const isSpare = dataView.getUint8(end, littleEndian);

			if (0 === isSpare) {
				const etx = dataView.getUint8(end + 1, littleEndian);
				if (EMAll.ETX === etx) {
					result.etxValid = true;
				}
			} else if (EMAll.ETX === isSpare) {
				result.etxValid = true;
			}

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMParamInstall.ReadInstall._toDescribeMap(dataView, offset, result, littleEndian);

			// -- result.ascii
			const size = EMParamInstall.ReadInstall._size;
			const start = offset + size;
			const end = start + result.get('length').v - size;
			const ascii = ParserA.ParseAscii(dataView, start, end);
			const desc = ParserA.Describe(ascii, 'ASCII', end - start);
			result.set('ascii', desc);

			// -- spare etx

			describeEOS(dataView, end, result, littleEndian);

			return result;
		}
	}

	class EMRuntimeParam {
		static TYPES = [0x52];
		static IsMyType(type) {
			return -1 < EMRuntimeParam.TYPES.findIndex(d => d === type);
		}

		static STRUCT_RUNTIME = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"],
			["serial", "U2"],
			["operatorStationStatus", "U1"],
			["PUStatus", "U1"], // Processing unit status (CPU)
			["BSPStatus", "U1"],
			["SHTStatus", "U1"], // Sonar head or transceiver status
			["mode", "U1"],
			["filterID", "U1"],
			["minDepth", "U2"], // meter
			["maxDepth", "U2"], // meter
			["absorpCoeff", "U2"], // meter 0.01dB/km
			["txPulseLen", "U2"], // micro-seconds
			["txBeamWidth", "U2"], // 0.1 degrees
			["txPower", "I1"], // transmit power re maximum in dB
			["rxBeamWidth", "U1"], // 0.1 degrees
			["rxBandwidth", "U1"], // 50Hz
			["rxGain", "U1"], // mode 2 or Receiver fixed gain setting in dB 0 ~ 50
			["TVGLawAng", "U1"], // TVG law crossover angle in degrees
			["srcSS", "U1"], // Source of sound speed at transducer
			["maxPortSwath", "U2"], // Maximum port swath width in m
			["beamSpacing", "U1"],
			["maxPortCoverage", "U1"], // degrees
			["yawPitchStable", "U1"], // Yaw and pitch stabilization mode
			["maxSTBDCoverage", "U1"],
			["maxSTBDSwath", "U2"], // meter
			["txTiltValue", "I2"], // Transmit along tilit in 0.1d
			["filterID2", "U1"],
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadRuntime = ParserA.CreateReader(EMRuntimeParam.STRUCT_RUNTIME);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMRuntimeParam.ReadRuntime._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}

		static BitPUStatus = [
			[0b00000001, 'Communication error With BSP (or CBMF) : All models except ME70BO'],
			[0b00000010, 'Communication error with Sonar Head or Transceiver : All models except EM 2040 and ME70BO, Communication error with slave PU : EM 2040/EM 2040C, Problem with communication with ME70 : ME70BO'],
			[0b00000100, 'Attitude not valid for this ping : All models'],
			[0b00001000, 'Heading not valid for this ping : All models'],
			[0b00010000, 'System clock has not been set since power up : All models'],
			[0b00100000, 'External trigger signal not detected : All models except ME70BO'],
			[0b01000000, 'CPU temperature warning : All models except EM 1002, Hull Unit not responding : EM 1002'],
			[0b10000000, 'Attitude velocity data not valid for this ping : EM 122 EM 302 EM 710 EM 2040 EM 2040C'],
		];

		// -- BSP Starts

		// -- EM 2000, EM 3000, EM 3002 only
		static BitBSPStatusA = [
			[0b00000001, 'Error on R0 data received by BSP 1 (May be a bad high speed link) : EM 2000, EM 3000, EM 3000D, EM 3002, EM 3002D'],
			[0b00000010, 'Too much seabed image data on BSP1 : EM 3000, EM 3000D'],
			[0b00000100, 'Invalid command received by BSP1 : EM 3000, EM 3000D'],
			[0b00001000, 'Errors on BSP1 : EM 3002, EM 3002D'],
			[0b00010000, 'Error on R0 data received by BSP 2 (May be a bad high speed link) : EM 3000D, EM 3002D'],
			[0b00100000, 'Too much seabed image data on BSP2 : EM 3000D'],
			[0b01000000, 'Invalid command received by BSP2 : EM 3000D'],
			[0b10000000, 'Errors on BSP2 : EM 3002, EM 3002D'],
		];

		// -- EM 1002 only
		static BitBSPStatusB = [
			[0b00000001, 'Sample number error in RX data received from SPRX']
		];

		// -- EM 120, EM 300
		static BitBSPStatusC = [
			[0b00000001, 'Sample number error in R0 data received from SPRX'],
			[0b00000010, 'Missing R0 header data from SPRX'],
			[0b00000100, 'Missing sample data from SPTX'],
			[0b00001000, 'Missing second R0 header data from SPTX'],
			[0b00010000, 'Bad sync TRU - PU - BSP'],
			[0b00100000, 'Bad parameters received from PU'],
			[0b01000000, 'Internal sync problem in BSP'],
			[0b10000000, 'Checksum error in header from SPTX'],
		];

		//  EM 122, EM 302, EM 710
		static BitBSPStatusD = [
			[0b00000001, 'Error on RX data received by BSP 1'],
			[0b00000010, 'Error on RX data received by BSP 3'],
			[0b00000100, 'Errors on BSP 3'],
			[0b00001000, 'Errors on BSP 1'],
			[0b00010000, 'Error on RX data received by BSP 2'],
			[0b00100000, 'Error on RX data received by BSP 4'],
			[0b01000000, 'Errors on BSP 4'],
			[0b10000000, 'Errors on BSP2'],
		];

		// EM 2040, EM 2040C
		static BitBSPStatusE = [
			[0b00000001, 'Error on data from BSP 1 - master PU'],
			[0b00000010, 'Error on data from BSP 2 - master PU'],
			[0b00000100, 'Error on data from BSP 3 - master PU'],
			[0b00001000, 'Error on data from BSP 4 - master PU'],
			[0b00010000, 'Error on data from BSP 1 - slave PU'],
			[0b00100000, 'Error on data from BSP 2 - slave PU'],
			[0b01000000, 'Error on data from BSP 3 - slave PU'],
			[0b10000000, 'Error on data from BSP 4 - slave PU'],
		];

		// EM 2040/EM 2040C
		static BitCRMFStatus = [
			[0b00000001, 'Error on data from CBMF 1 - master PU'],
			[0b00000010, 'Error on data from CBMF 2 - master PU'],
			[0b00000100, 'Error on data from CBMF 3 - slave PU'],
			[0b00001000, 'Error on data from CBMF 4 - slave PU'],
		];

		static ModelBSPStatus = new Map([
			[2000, [EMRuntimeParam.BitBSPStatusA]],
			[3000, [EMRuntimeParam.BitBSPStatusA]],
			[3002, [EMRuntimeParam.BitBSPStatusA]],
			[1002, [EMRuntimeParam.BitBSPStatusB]],
			[102, [EMRuntimeParam.BitBSPStatusC]],
			[300, [EMRuntimeParam.BitBSPStatusC]],
			[122, [EMRuntimeParam.BitBSPStatusD]],
			[302, [EMRuntimeParam.BitBSPStatusD]],
			[710, [EMRuntimeParam.BitBSPStatusD]],
			[2040, [EMRuntimeParam.BitBSPStatusE]],
		]);

		// -- BSP Ends


		// -- SHT Starts

		// Transceiver status EM 120 and EM 300
		static BitTransceiverStatusA = [
			[0b00000001, 'Transmit voltage (HV) out of range'],
			[0b00000010, 'Low voltage power out of range'],
			[0b00000100, 'Timeout error (SPRX waits for SPTX)'],
			[0b00001000, 'Receive channel DC offset(s) out of range'],
			[0b00010000, 'Illegal parameter received from PU'],
			[0b00100000, 'Internal communication error (SPTX - SPRX sync)'],
			[0b01000000, 'Timeout error (SPTX waits for SPRX)'],
			[0b10000000, 'Defective fuse(s) in transmitter'],
		];

		// Transceiver status EM 122, EM 302 and EM 710
		static BitTransceiverStatusB = [
			[0b00000001, 'Transmit voltage (HV) out of range'],
			[0b00000010, 'Low voltage power out of range'],
			[0b00000100, 'Error on Transmitter'],
			[0b00001000, 'Error on Receiver'],
			[0b00010000, 'Not implemented'],
			[0b00100000, 'Not implemented'],
			[0b01000000, 'Not implemented'],
			[0b10000000, 'Not implemented'],
		];

		// Transceiver status EM 1002
		static BitTransceiverStatusC = [
			[0b00000001, 'Transmit voltage (HV) out of range'],
			[0b00000010, 'Low voltage power out of range'],
			[0b00000100, 'Transmit voltage (HV) to high'],
			[0b00001000, 'Error in command from PU (Illegal parameter)'],
			[0b00010000, 'Error in command from PU (Bad checksum)'],
			[0b00100000, 'Error in command from PU (Bad datagram length)'],
		];

		// Transceiver status EM 2040
		static BitTransceiverStatusD = [
			[0b00000001, 'Transmit power (HV) out of range'],
			[0b00000010, 'Communication error with TX'],
			[0b00000100, 'Communication error with RX 1 (port)'],
			[0b00001000, 'Communication error with RX 2 (starboard)'],
			[0b00010000, 'Communication error with IO2040 - master PU'],
			[0b00100000, 'Communication error with IO2040 - slave PU'],
			[0b01000000, 'Spare'],
			[0b10000000, 'Spare'],
		];


		// Sonar Head status EM 2000, EM 3000 and EM 3002
		static BitSonarHeadStatusA = [
			[0b00000001, 'Temperature to high on Sonar Head 1 EM 2000, EM 3000, EM 3000D, EM 3002, EM 3002D'],
			[0b00000010, 'Data link failure on Sonar Head 1 EM 2000, EM 3000, EM 3000D, EM 3002, EM 3002D'],
			[0b00000100, 'DC Supply Voltages in Sonar Head 1 is out of range EM 2000, EM 3000, EM 3000D, EM 3002, EM 3002D'],
			[0b00001000, 'Spare'],
			[0b00010000, 'Temperature to high on Sonar Head 2 EM 3000D, EM 3002D'],
			[0b00100000, 'Data link failure on Sonar Head 2 EM 3000D, EM 3002D'],
			[0b01000000, 'DC Supply Voltages in Sonar Head 2 is out of range EM 3000D, EM 3002D'],
			[0b10000000, 'Spare'],
		];

		// Sonar Head status EM 2040C
		static BitSonarHeadStatusB = [
			[0b00000001, 'Transmit power (HV) out of range SH1'],
			[0b00000010, 'Communication error with TX SH1'],
			[0b00000100, 'Communication error with RX SH1'],
			[0b00001000, 'Temperature to high SH1'],
			[0b00010000, 'Transmit power (HV) out of range SH2'],
			[0b00100000, 'Communication error with TX SH2'],
			[0b01000000, 'Communication error with RX SH2'],
			[0b10000000, 'Temperature to high SH2'],
		];

		static ModelSHTStatus = new Map([
			[102, [EMRuntimeParam.BitTransceiverStatusA]],
			[300, [EMRuntimeParam.BitTransceiverStatusA]],
			[122, [EMRuntimeParam.BitTransceiverStatusB]],
			[302, [EMRuntimeParam.BitTransceiverStatusB]],
			[710, [EMRuntimeParam.BitTransceiverStatusB]],
			[1002, [EMRuntimeParam.BitTransceiverStatusC]],
			[2000, [EMRuntimeParam.BitSonarHeadStatusA]],
			[3000, [EMRuntimeParam.BitSonarHeadStatusA]],
			[3002, [EMRuntimeParam.BitSonarHeadStatusA]],
			[2040, [EMRuntimeParam.BitTransceiverStatusD, EMRuntimeParam.BitSonarHeadStatusB]],
		]);

		// -- SHT Ends

		// -- MODE Starts

		// Ping mode (EM 3000)
		static BitEqualPingModeA = [
			[0b1111, 0b0000, 'Nearfield (4º)'],
			[0b1111, 0b0001, 'Normal (1.5º)'],
			[0b1111, 0b0010, 'Target detect'],
		]

		// Ping mode (EM 3002)
		static BitEqualPingModeB = [
			[0b1111, 0b0000, 'Wide Tx beamwidth (4°)'],
			[0b1111, 0b0001, 'Normal Tx beamwidth (1.5°)'],
		];


		// Ping mode (EM 2000, EM 710, EM 1002, EM 300, EM 302, EM 120 and EM 122)
		static BitEqualPingModeC = [
			[0b1111, 0b0000, 'Very Shallow'],
			[0b1111, 0b0001, 'Shallow'],
			[0b1111, 0b0010, 'Medium'],
			[0b1111, 0b0011, 'Deep'],
			[0b1111, 0b0100, 'Very deep'],
			[0b1111, 0b0101, 'Extra deep'],
		];

		// Ping mode (EM 2040)
		static BitEqualPingModeD = [
			[0b1111, 0b0000, '200 kHz'],
			[0b1111, 0b0001, '300 kHz'],
			[0b1111, 0b0010, '400 kHz'],
		];

		//TX pulse form (EM 2040, EM 710, EM 302 and EM 122)
		static BitEqualTXPulseFormA = [
			[0b00110000, 0b00000000, 'CW'],
			[0b00110000, 0b00010000, 'Mixed'],
			[0b00110000, 0b00100000, 'FM'],
		];

		// Frequency (EM 2040C)
		// Frequency = 180 kHz + 10 kHz * parameter
		// Examples:
		static BitEqualFrequency = [
			[0b00011111, 0b00000000, '180 kHz'],
			[0b00011111, 0b00000001, '190 kHz'],
			[0b00011111, 0b00010110, '400 kHz'],
		];

		// TX pulse form (EM 2040C)
		static BitEqualTXPulseFormB = [
			[0b00100000, 0b00000000, 'CW'],
			[0b00100000, 0b00100000, 'FM'],
		];

		// Dual Swath mode(EM 2040, EM 710, EM 302 and EM 122)
		static BitEqualDualSwathMode = [
			[0b11000000, 0b00000000, 'Dual swath = Off'],
			[0b11000000, 0b01000000, 'Dual swath = Fixed'],
			[0b11000000, 0b10000000, 'Dual swath = Dynamic'],
		];

		static ModelMode = new Map([
			[3000, [EMRuntimeParam.BitEqualPingModeA]],
			[3002, [EMRuntimeParam.BitEqualPingModeB]],
			[2000, [EMRuntimeParam.BitEqualPingModeC]],
			[710, [EMRuntimeParam.BitEqualPingModeC, EMRuntimeParam.BitEqualTXPulseFormA, EMRuntimeParam.BitEqualDualSwathMode]],
			[1002, [EMRuntimeParam.BitEqualPingModeC]],
			[300, [EMRuntimeParam.BitEqualPingModeC]],
			[302, [EMRuntimeParam.BitEqualPingModeC, EMRuntimeParam.BitEqualTXPulseFormA, EMRuntimeParam.BitEqualDualSwathMode]],
			[120, [EMRuntimeParam.BitEqualPingModeC]],
			[122, [EMRuntimeParam.BitEqualPingModeC, EMRuntimeParam.BitEqualTXPulseFormA, EMRuntimeParam.BitEqualDualSwathMode]],
			[2040, [EMRuntimeParam.BitEqualPingModeD, EMRuntimeParam.BitEqualTXPulseFormA, EMRuntimeParam.BitEqualFrequency, EMRuntimeParam.BitEqualTXPulseFormB, EMRuntimeParam.BitEqualDualSwathMode]],
		]);

		// -- MODE Ends

		// -- Filter Identifier Starts
		// -- filterID only, not for filterID2
		static BitEqualFilterID = [
			[0b00000011, 0b00000000, 'Spike filter set to Off'],
			[0b00000011, 0b00000001, 'Spike filter is set to Weak'],
			[0b00000011, 0b00000010, 'Spike filter is set to Medium'],
			[0b00000011, 0b00000011, 'Spike filter is set to Strong'],
			[0b00000100, 0b00000100, 'Slope filter is on'],
			[0b00001000, 0b00001000, 'Sector tracking or Robust Bottom Detection (EM 3000) is on'],
			[0b10010000, 0b00000000, 'Range gates have Normal size'],
			[0b10010000, 0b00010000, 'Range gates are Large'],
			[0b10010000, 0b10000000, 'Range gates are Small'],
			[0b00100000, 0b00100000, 'Aeration filter is on'],
			[0b01000000, 0b01000000, 'Interference filter is on'],
		]
		// -- Filter Identifier Ends

		// -- it has its models but not duplicated, so no models
		static BitEqualFilterID2 = [
			// Penetration filter (EM 2040, EM 710, EM 302 and EM 122)
			[0b00000011, 0b00000000, 'Penetration filter = Off'],
			[0b00000011, 0b00000001, 'Penetration filter = Weak'],
			[0b00000011, 0b00000010, 'Penetration filter = Medium'],
			[0b00000011, 0b00000011, 'Penetration filter = Strong'],

			// Detect mode (EM 3002 and EM 2040)
			[0b00001100, 0b00000000, 'Detect mode: Normal'],
			[0b00001100, 0b00000100, 'Detect mode: Waterway'],
			[0b00001100, 0b00001000, 'Detect mode: Tracking'],
			[0b00001100, 0b00001100, 'Detected mode: Minimum depth'],

			// Phase ramp (EM 2040, EM 3002, EM 710, EM 302 and EM 122)
			[0b00110000, 0b00000000, 'Short phase ramp'],
			[0b00110000, 0b00010000, 'Normal phase ramp'],
			[0b00110000, 0b00100000, 'Long phase ramp'],

			// Special TVG (EM 3002 and EM 2040)
			[0b01000000, 0b00000000, 'Normal TVG'],
			[0b01000000, 0b01000000, 'Special TVG'],

			// Special amp detect / soft sediments
			[0b10000000, 0b00000000, 'Normal amp detect'],
			[0b10000000, 0b10000000, 'Special amp detect or soft sediments (EM 3002)'],
		]

		// -- srcSS
		static BitEqualSoundSpeed = [
			[0b00000011, 0b00000000, 'From real time sensor'],
			[0b00000011, 0b00000001, 'Manually entered by operator'],
			[0b00000011, 0b00000010, 'Interpolated from currently used sound speed profile'],
			[0b00000011, 0b00000011, 'Calculated by ME70BO TRU'],
			[0b00010000, 0b00010000, 'Extra detections enabled'],
			[0b00100000, 0b00100000, 'Sonar mode enabled'],
			[0b01000000, 0b01000000, 'Passive mode enabled'],
			[0b10000000, 0b10000000, '3D scanning enabled'],
		];

		// -- beamSpacing, except 3002
		static BitEqualBeamspacing = [
			[0b00000011, 0b00000000, 'Determined by beamwidth (FFT beamformer of EM 3000)'],
			[0b00000011, 0b00000001, 'Equidistant (Inbetween for EM 122 and EM 302)'],
			[0b00000011, 0b00000010, 'Equiangle'],
			[0b00000011, 0b00000011, 'High density equidistant (In between for EM 2000, EM 120, EM 300, EM 1002)'],
		];

		// only for 3002
		static BitEqualBeamspacing3002Only = [
			[0b10000000, 0b00000000, 'Only one sonar head is connected. If two heads are connected, both have the same beam spacing.'],
			[0b10000000, 0b10000000, 'Two sonar heads are connected. Individual beam spacing is possible.'],
			[0b01110000, 0b00000000, 'No head 2'],
			[0b01110000, 0b00010000, 'h2 equidistant'],
			[0b01110000, 0b00100000, 'h2 equiangle'],
			[0b01110000, 0b00110000, 'h2 high density'],
			[0b00001111, 0b00000001, 'h1 equidistant'],
			[0b00001111, 0b00000010, 'h1 equiangle'],
			[0b00001111, 0b00000011, 'h1 high density'],
		]

		static BitEqualYawPitchStable = [
			[0b00000011, 0b00000000, 'No yaw stabilization'],
			[0b00000011, 0b00000001, 'Yaw stabilization to survey line heading (Not used)'],
			[0b00000011, 0b00000010, 'Yaw stabilization to mean vessel heading'],
			[0b00000011, 0b00000011, 'Yaw stabilization to manually entered heading'],
			[0b00001100, 0b00000000, 'Heading filter, hard'],
			[0b00001100, 0b00000100, 'Heading filter, medium'],
			[0b00001100, 0b00001000, 'Heading filter, weak'],
			[0b10000000, 0b10000000, 'Pitch stabilization is on.']
		];

		// -- rxGain - only for 2040 or 2040C
		static BitEqualRXFixedGain20040Only = [
			[0b00000011, 0b00000000, 'Off (RX inactive)'],
			[0b00000011, 0b00000001, 'port active'],
			[0b00000011, 0b00000010, 'starboard active'],
			[0b00000011, 0b00000011, 'Both active'],
			[0b00001100, 0b00000000, 'Short CW'],
			[0b00001100, 0b00000100, 'Medium CW'],
			[0b00001100, 0b00001000, 'Long CW'],
			[0b00001100, 0b00001100, 'FM'],
			[0b01110000, 0b00000000, 'Very Short CW'],
			[0b01110000, 0b00010000, 'Short CW'],
			[0b01110000, 0b00100000, 'Medium CW'],
			[0b01110000, 0b00110000, 'Long CW'],
			[0b01110000, 0b01000000, 'Very Long CW'],
			[0b01110000, 0b01010000, 'Extra Long CW'],
			[0b01110000, 0b01100000, 'Short FM'],
			[0b01110000, 0b01110000, 'Long FM'],
		];

		static ParseOperatorStationStatus(v) {
			return []; // not yet used
		}

		// PUStatus
		static ParsePUStatus(v) {
			return ParserA.ParseBit(EMRuntimeParam.BitPUStatus, v);
		}

		// BSPStatus
		static ParseBSPStatus(v, model) {
			const bit = EMRuntimeParam.ModelBSPStatus.get(model);
			if (!bit) {
				return [[v, `No model found for ${model}`]];
			}

			return ParserA.ParseBit(bit, v);
		}

		// SHTStatus - sonar head or transceiver
		static ParseSHTStatus(v, model) {
			const bit = EMRuntimeParam.ModelSHTStatus.get(model);

			if (!bit) {
				return [[v, `No model found for ${model}`]];
			}

			return [].concat(...bit.map(b => ParserA.ParseBit(b, v)));
		}

		static ParseMode(v, model) {
			const bit = EMRuntimeParam.ModelMode.get(model);

			if (!bit) {
				return [[v, `No model found for ${model}`]];
			}

			return [].concat(...bit.map(b => ParserA.ParseBitEqual(b, v)));
		}

		static ParseFilterID(v) {
			return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualFilterID, v);
		}

		static ParseFilterID2(v) {
			return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualFilterID2, v);
		}

		static ParseSrcSS(v) {
			return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualSoundSpeed, v);
		}

		static ParseBeamSpacing(v, model) {
			if (3002 === model) {
				return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualBeamspacing3002Only, v);
			} else {
				return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualBeamspacing, v);
			}
		}

		static ParseYawPitchStable(v) {
			return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualYawPitchStable, v);
		}

		static ParseRXGain(v, model) {
			if (2040 !== model) {
				return [[0, 0, v]]; // v is dB
			} else {
				return ParserA.ParseBitEqual(EMRuntimeParam.BitEqualRXFixedGain20040Only, v);
			}
		}
	}

	class EMPosition {
		static TYPES = [0x50];
		static IsMyType(type) {
			return -1 < EMPosition.TYPES.findIndex(d => d === type);
		}

		static STRUCT_POSITION = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["positionCounter", "U2"],
			["serial", "U2"],
			["lat", "I4"],
			["lng", "I4"],
			["measurePosFixQ", "U2"],
			["speed", "U2"], // cm/s
			["course", "U2"], // 0.01 Degree
			["heading", "U2"], // 0.01 Degree
			["posSysDesc", "U1"],
			["numInput", "U1"]
		]);

		static ReadPosition = ParserA.CreateReader(EMPosition.STRUCT_POSITION);

		static ParseLatDegree = (v) => v / 20000000;
		static ParseLngDegree = (v) => v / 10000000;
		static ParseSpeedMpS = (v) => v / 100; // to meter / second
		static ParseCourseDegree = (v) => v / 100;
		static ParseHeadingDegree = (v) => v / 100;

		static ParseSection(dataView, offset, littleEndian) {
			const result = {},
				read = {};

			const S = EMPosition;

			S.ReadPosition._toObject(
				dataView,
				offset,
				["date", "time", "lat", "lng", "speed", "course", "heading"],
				read,
				littleEndian
			);

			const dt = ParseDateTime(read.date, read.time);

			result.dt = dt;
			result.lat = S.ParseLatDegree(read.lat);
			result.lng = S.ParseLngDegree(read.lng);
			result.speed = S.ParseSpeedMpS(read.speed);
			result.course = S.ParseCourseDegree(read.course);
			result.heading = S.ParseHeadingDegree(read.heading);

			// TODO Read inputs strings

			return result;
		}

		/*
		[date, time, lat degree, lng degree, heading degree]
		*/
		static ParseSectionMinimum(dataView, offset, littleEndian) {
			const S = EMPosition;

			const result = [
				S.ReadPosition.date(dataView, offset, littleEndian),
				S.ReadPosition.time(dataView, offset, littleEndian),
				EMPosition.ParseLatDegree(S.ReadPosition.lat(dataView, offset, littleEndian)),
				EMPosition.ParseLngDegree(S.ReadPosition.lng(dataView, offset, littleEndian)),
				EMPosition.ParseHeadingDegree(S.ReadPosition.heading(dataView, offset, littleEndian)),
			];

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMPosition.ReadPosition._toDescribeMap(dataView, offset, result, littleEndian);

			let seq = EMPosition.ReadPosition._size;
			const start = offset + seq;
			const numInput = result.get('numInput').v;
			const end = start + numInput;
			const ascii = ParserA.ParseAscii(dataView, start, end);
			result.set('input', ParserA.Describe(ascii, 'A' + numInput, numInput));

			describeEOS(dataView, end, result, littleEndian);

			return result;
		}
	}

	class EMDepthDatagram {
		static TYPES = [0x44];
		static IsMyType(type) {
			return -1 < EMDepthDatagram.TYPES.findIndex(d => d === type);
		}

		static STRUCT_DD_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"],
			["serial", "U2"],
			["heading", "U2"],
			["ss", "U2"],
			["txTRDepth", "U2"], // cm ', 14000 ~ 16000
			["maxNumBeams", "U1"], // maximum number of beams possible, 48 ~
			["numValid", "U1"], // 1 ~ 254
			["zRes", "U1"], // z Resolution in cm 1 ~ 254
			["xyRes", "U1"], // x and y resolution in cm 1 ~ 254
			["freq", "U2"] // Sampling rate in Hz 300 ~ 30000 or Depth diff between sonar heads in EM3000(S2)
		]);

		static STRUCT_DD_BODY = new Map([
			["z", "U2"], // Depth, Unsigned 2 bytes for EM120, EM300, others Signed 2 bytes
			["y", "I2"], // Acrosstrack, STBD Port
			["x", "I2"], // Alongtrack, Stern Ahead
			["beamDeprAng", "I2"], // Beam depression angle in 0.01, -11000 ~ 11000
			["beamAzimAng", "U2"], // Beam azimuth angle in 0.01, 0 ~ 56999
			["range", "U2"], // one way travle time, 0 ~ 65534
			["QFac", "U1"],
			["len", "U1"], // length of detection window (samples/4) 1 ~ 254
			["reflectivity", "I1"], // 0.5dB, -20dB = 216
			["beamNum", "U1"] // Beam number 1 ~ 254
		]);

		static STRUCT_DD_BODY_SIGN = new Map([
			["z", "I2"], // Depth, Unsigned 2 bytes for EM120, EM300, others Signed 2 bytes
			["y", "I2"], // Acrosstrack, STBD Port
			["x", "I2"], // Alongtrack, Stern Ahead
			["beamDeprAng", "I2"], // Beam depression angle in 0.01, -11000 ~ 11000
			["beamAzimAng", "U2"], // Beam azimuth angle in 0.01, 0 ~ 56999
			["range", "U2"], // one way travle time, 0 ~ 65534
			["QFac", "U1"],
			["len", "U1"], // length of detection window (samples/4) 1 ~ 254
			["reflectivity", "I1"], // 0.5dB, -20dB = 216
			["beamNum", "U1"] // Beam number 1 ~ 254
		]);

		static STRUCT_DD_TAIL = new Map([
			["depthOffsetM", "I1"], // transducer depth offset multiplier, -1 ~ +17
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMDepthDatagram.STRUCT_DD_HEAD);
		static ReadBody = ParserA.CreateReader(EMDepthDatagram.STRUCT_DD_BODY);
		static ReadBodySign = ParserA.CreateReader(EMDepthDatagram.STRUCT_DD_BODY_SIGN);
		static ReadTail = ParserA.CreateReader(EMDepthDatagram.STRUCT_DD_TAIL);

		// [date, time, numBeams, txTRDepth, [body]] return in meter
		static ParseSectionMinimum(dataView, offset, littleEndian) {
			// 120, 300 is diff for body.z
			const model = EMDepthDatagram.ReadHead.model(dataView, offset, littleEndian);

			const result = [
				EMDepthDatagram.ReadHead.date(dataView, offset, littleEndian),
				EMDepthDatagram.ReadHead.time(dataView, offset, littleEndian),
				EMDepthDatagram.ReadHead.numValid(dataView, offset, littleEndian),
				EMDepthDatagram.ReadHead.txTRDepth(dataView, offset, littleEndian) / 100,
			];

			const offsetBody = EMDepthDatagram.ReadHead._size + offset;
			const body = [];

			let readBody = EMDepthDatagram.ReadBody;
			if(120 === model || 300 === model) {
				readBody = EMDepthDatagram.ReadBodySign;
			}

			for (let j = 0; j < result[2]; j++) {
				const offsetCurrentBody = offsetBody + j * readBody._size;
				const x = readBody.x(dataView, offsetCurrentBody, littleEndian);
				const y = readBody.y(dataView, offsetCurrentBody, littleEndian);
				const z = readBody.z(dataView, offsetCurrentBody, littleEndian);
				body.push([x / 100, y / 100, z / 100]);
			}

			result.push(body);

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMDepthDatagram.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			const model = result.get('model').v;
			const num = result.get('numValid').v;
			let seq = EMDepthDatagram.ReadHead._size;

			let readBody = EMDepthDatagram.ReadBody;
			if(120 === model || 300 === model) {
				readBody = EMDepthDatagram.ReadBodySign;
			}

			for (let i = 0; i < num; i++) {
				const seqOffset = seq + (readBody._size * i);
				const entry = new Map();
				readBody._toDescribeMap(dataView, seqOffset, entry, littleEndian);

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			seq = seq + (readBody._size * num);
			EMDepthDatagram.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMSoundSpeedProfile {
		static TYPES = [0x55];
		static IsMyType(type) {
			return -1 < EMSoundSpeedProfile.TYPES.findIndex(d => d === type);
		}

		static STRUCT_SS_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"],
			["serial", "U2"],
			["date2", "U4"], // 19950226 - 1995 Feb 26
			["time2", "U4"], // time since midnight in seconds 29571 = 08:12:51
			["numEntries", "U2"], // Number of entries = N, 1 ~
			["depthRes", "U2"], // Depth resolution in cm, 1 ~ 254
		]);

		static STRUCT_SS_ENTRY = new Map([
			["depth", "U4"], // Depth 0 ~ 120 0000
			["ss", "U4"], // Sound speed in dm/s, 14000 ~ 17000
		]);

		static STRUCT_SS_TAIL = new Map([
			["spareEOS", "U1"],
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMSoundSpeedProfile.STRUCT_SS_HEAD);
		static ReadEntry = ParserA.CreateReader(EMSoundSpeedProfile.STRUCT_SS_ENTRY);
		static ReadTail = ParserA.CreateReader(EMSoundSpeedProfile.STRUCT_SS_TAIL);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();
			const endian = false === littleEndian ? false : true;

			EMSoundSpeedProfile.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			const num = result.get('numEntries').v;
			let seq = offset + EMSoundSpeedProfile.ReadHead._size;
			for (let i = 0; i < num; i++) {
				const seqOffset = seq + (8 * i);
				const depth = EMSoundSpeedProfile.ReadEntry.depth(dataView, seqOffset, endian);
				const ss = EMSoundSpeedProfile.ReadEntry.ss(dataView, seqOffset + 4, endian);
				result.set(`depth_${i + 1}`, ParserA.Describe(depth, 'U4', 4));
				result.set(`ss_${i + 1}`, ParserA.Describe(ss, 'U4', 4));
			}

			seq = seq + 8 * num;
			EMSoundSpeedProfile.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMPUID {
		static TYPES = [0x30];
		static IsMyType(type) {
			return -1 < EMPUID.TYPES.findIndex(d => d === type);
		}

		static STRUCT_PU_ID = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["byteOrder", "U2"], // always 1
			["serial", "U2"], // system serial number, 100 ~
			["UDP1", "U2"], // UDP Port no 1
			["UDP2", "U2"], // UDP Port no 2
			["UDP3", "U2"], // UDP Port no 3
			["UDP4", "U2"], // UDP Port no 4
			["sysDesc", "U4"], // System descriptor
			["PUVer", "A16"], // PU Software version Ascii string
			["BSPVer", "A16"], // BSP Software version Ascii string
			["sonarHead1Ver", "A16"], // Sonar head/transceiver software version
			["sonarHead2Ver", "A16"], // Sonar head/transceiver software version
			["IPAddr", "U4"], // Host IP Address
			["txOpenAng", "U1"], // TX Opening angle, 0, 1, 2 or 4
			["rxOpenAng", "U1"], // RX Opening angle, 1, 2 or 4
			["spare1", "U4"], // Spare
			["spare2", "U2"], // Spare
			["spareEOS", "U1"], // Spare
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadPUID = ParserA.CreateReader(EMPUID.STRUCT_PU_ID);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMPUID.ReadPUID._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}

	class EMPUStatusOutput {
		static TYPES = [0x31];
		static IsMyType(type) {
			return -1 < EMPUStatusOutput.TYPES.findIndex(d => d === type);
		}

		static STRUCT_PU_STATUS = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["statusCounter", "U2"], // Status datagram counter, 0 ~ 65535
			["serial", "U2"], // System serial number, 100 ~
			["pingRate", "U2"], // Ping rate in centiHz, 0 ~ 3000
			["pingCounter", "U2"], // Ping counter of latest ping, 0 ~ 65535
			["distSwath10", "U4"], // Distance between swath in 10%, 0 ~ 255
			["UDP2", "U4"], // Sensor input status, UDP port 2
			["serial1", "U4"], // Sensor input status, serial port 1
			["serial2", "U4"], // Sensor input status, serial port 2
			["serial3", "U4"], // Sensor input status, serial port 3
			["serial4", "U4"], // Sensor input status, serial port 4
			["pps", "I1"], // PPS status
			["posStat", "I1"], // Position status
			["attStat", "I1"], // Attitude status
			["clockStat", "I1"], // Clock status
			["headingStat", "I1"], // heading status
			["puStat", "U1"], // PU status
			["lastHeading", "U2"], // Last received heading in 0.01 Degree, 0 ~ 35999
			["lastRoll", "I2"], // Last received roll in 0.01 Degree, -18000 ~ 18000
			["lastPitch", "I2"], // Last received pitch in 0.01 Degree, -18000 ~ 18000
			["lastHeave", "U2"], // Last received heave at sonar head in cm, -999 ~ 999
			["ssTrans", "U2"], // Sound speed at transducer dm/s, 14000 ~ 16000
			["lastDepth", "U4"], // Last received depth in cm, 0 ~
			["velocity", "I2"], // Along-ship velocity in 0.01 m/s
			["attVelocity", "U1"], // 0x81
			["mammalRamp", "U1"], // Mammal protection ramp
			["backObliqueAngle", "I1"], // Backscatter at Oblique angle in dB, -30
			["backIncidence", "I1"], // Backscatter at normal incidence in dB, -20
			["fixedGain", "I1"], // Fixed gain in dB, 18
			["depthIncidence", "U1"], // Depth to normal incidence in m, 27
			["rangeIncidence", "U2"], // Range to normal incidence in m, 289
			["portCoverage", "U1"], // Port Coverage in degrees
			["stbdCoverage", "U1"], // Starboard Coverage in degrees
			["ssTransProfile", "U2"], // Sound speed at transducer found from profile in dm/s, 14000 ~ 16000
			["yawStabAngle", "I2"], // Yaw stabilization angle or tilit used at 3D scanning, in centideg
			["portCoverage2", "I2"], // Port Coverage in degrees or Across-ship velocity in 0.01 m/s
			["stbdCoverage2", "I2"], // Starboard Coverage in degrees or Downward velocity in 0.01 m/s
			["tempCPU", "I1"], // EM2040 CPU temp in Degree celsius, 0 if not used
			["etx", "U1"],
			["checksum", "U2"],
		]);

		static ReadPUStatus = ParserA.CreateReader(EMPUStatusOutput.STRUCT_PU_STATUS);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMPUStatusOutput.ReadPUStatus._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}


	class EMNetworkAttitudeVelocity {
		static TYPES = [0x6E];
		static IsMyType(type) {
			return -1 < EMNetworkAttitudeVelocity.TYPES.findIndex(d => d === type);
		}

		static STRUCT_NATTV = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["netAttCounter", "U2"], // network attitude counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["numEntries", "U2"], // Number of entries = N, 1 ~
			["senSysDesc", "I1"], // Sensor system descriptor
			["spare1", "U1"],
		]);

		static STRUCT_NATTV_ENTRY = new Map([
			["time", "U2"], // time in milliseconds since record start, 0 ~ 65535
			["roll", "I2"], // Roll in 0.01 Degree, -18000 ~ 18000
			["pitch", "I2"], // Pitch in 0.01 Degree, -18000 ~ 18000
			["heave", "I2"], // Heave in cm - 1000 ~ 10000
			["heading", "U2"], // Heading in 0.01 Degree, 0 ~ 35999
			["numBytes", "U1"], // Number of bytes in input datagram (Nx), 1 ~ 254
		]);

		static ReadHead = ParserA.CreateReader(EMNetworkAttitudeVelocity.STRUCT_NATTV);
		static ReadEntry = ParserA.CreateReader(EMNetworkAttitudeVelocity.STRUCT_NATTV_ENTRY);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMNetworkAttitudeVelocity.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			const num = result.get('numEntries').v;
			let seq = offset + EMNetworkAttitudeVelocity.ReadHead._size;

			for (let i = 0; i < num; i++) {
				const entry = new Map();
				EMNetworkAttitudeVelocity.ReadEntry._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMNetworkAttitudeVelocity.ReadEntry._size;
				const numBytes = entry.get('numBytes').v;
				const inputs = ParserA.ParseAscii(dataView, seq, seq + numBytes);
				seq = seq + numBytes;
				entry.set('inputs', ParserA.Describe(inputs, 'A' + numBytes, numBytes));

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			describeEOS(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMClock {
		static TYPES = [0x43];
		static IsMyType(type) {
			return -1 < EMClock.TYPES.findIndex(d => d === type);
		}

		static STRUCT_CLOCK = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["clockCounter", "U2"], // Clock counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["date2", "U4"], // date from external clock input
			["time2", "U4"], // time from external clock datagram
			["ppsUsed", "U1"], // 1PPS use (active or not), 0 = inactive
			["etx", "U1"],
			["checksum", "U2"]
		]);


		static ReadClock = ParserA.CreateReader(EMClock.STRUCT_CLOCK);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMClock.ReadClock._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}

	class EMAttitude {
		static TYPES = [0x41];
		static IsMyType(type) {
			return -1 < EMAttitude.TYPES.findIndex(d => d === type);
		}

		static STRUCT_ATT_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["attCounter", "U2"], // Attitude counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["numEntries", "U2"], // Number of entries = N, 1 ~
		]);

		static STRUCT_ATT_ENTRY = new Map([
			["time", "U2"], // time in milliseconds since record start, 0 ~ 65535
			["senStatus", "U2"], // Sensor status
			["roll", "I2"], // Roll in 0.01 Degree, -18000 ~ 18000
			["pitch", "I2"], // Pitch in 0.01 Degree, -18000 ~ 18000
			["heave", "I2"], // Heave in cm - 1000 ~ 10000
			["heading", "U2"], // Heading in 0.01 Degree, 0 ~ 35999
		]);

		static STRUCT_ATT_TAIL = new Map([
			["senSysDesc", "U1"], // Sensor system descriptor
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMAttitude.STRUCT_ATT_HEAD);
		static ReadEntry = ParserA.CreateReader(EMAttitude.STRUCT_ATT_ENTRY);
		static ReadTail = ParserA.CreateReader(EMAttitude.STRUCT_ATT_TAIL);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMAttitude.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			const num = result.get('numEntries').v;
			let seq = offset + EMAttitude.ReadHead._size;

			for (let i = 0; i < num; i++) {
				const entry = new Map();
				EMAttitude.ReadEntry._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMAttitude.ReadEntry._size;

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			EMAttitude.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	// -- not yet tested, seconds entry not implemented
	class EMSeabedImage {
		static TYPES = [0x53];
		static IsMyType(type) {
			return -1 < EMSeabedImage.TYPES.findIndex(d => d === type);
		}

		static STRUCT_SEABED_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"], // Ping counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["meanAbsorpCoeff", "U2"], // Mean absorption coefficient in 0.01dB/km, 1 ~ 20000
			["pulseLen", "U2"], // Pulse length in micro seconds, 50 ~
			["rangeIncience", "U2"], // Range to normal incidence used to correct sample amplitudes in no. of sampes, 1 ~ 16384
			["startTVG", "U2"], // Start range sample of TVG ramp if not enough dynamic range (0 else), 0 ~ 16384
			["stoptTVG", "U2"], // Stop range sample of TVG ramp if not enough dynamic range (0 else), 0 ~ 16384
			["BSN", "I1"], // Normal incidence BS in dB (BSN) Example: -20 dB = 236, -50 ~ 10
			["BSO", "I1"], // Oblique BS in dB (BSO) Example: -1 dB = 255, -60 ~ 0
			["txBeamWidth", "U2"], // Tx beamwidth in 0.1 Degree, 1 ~ 300
			["tvgLaw", "U1"], // TVG law crossover angle in 0.1 Degree, 20 ~ 300,
			["numValidBeams", "U1"], // Number of valid beams (N)
		]);

		static STRUCT_SEABED_ENTRY = new Map([
			["idx", "U1"], // beam index number, 0 ~ 253
			["direction", "I1"], // sorting direction, -1 or 1
			["Ns", "U2"], // number of samples per beam = Ns, 1 ~
			["centreSampleNum", "U2"], // centre sample number, 1 ~
		]);

		static ReadHead = ParserA.CreateReader(EMSeabedImage.STRUCT_SEABED_HEAD);
		static ReadEntry = ParserA.CreateReader(EMSeabedImage.STRUCT_SEABED_ENTRY);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMSeabedImage.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);
			const num = result.get('numValidBeams').v;

			let seq = offset + EMSeabedImage.ReadHead._size;

			for (let i = 0; i < num; i++) {
				const entry = new Map();
				EMSeabedImage.ReadEntry._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMSeabedImage.ReadEntry._size;

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			// TODO next entries and etx
			// implements like 89 second entry, its verified

			return result;
		}
	}

	class EMSeabedImage89 {
		static TYPES = [0x59, 0x89];
		static IsMyType(type) {
			return -1 < EMSeabedImage89.TYPES.findIndex(d => d === type);
		}

		static STRUCT_SEABED89_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"], // Ping counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["sampleFreq", "F4"], // Sampling frequency in Hz
			["rangeIncience", "U2"], // Range to normal incidence used to correct sample amplitudes in no. of sampes, 1 ~ 16384
			["BSN", "I2"], // Normal incidence BS in dB (BSN)
			["BSO", "I2"], // Oblique BS in dB (BSO)
			["txBeamWidth", "U2"], // Tx beamwidth in 0.1 Degree, 1 ~ 300
			["tvgLaw", "U2"], // TVG law crossover angle in 0.1 Degree, 20 ~ 300,
			["numValidBeams", "U2"], // Number of valid beams (N)
		]);

		static STRUCT_SEABED89_ENTRY = new Map([
			["direction", "I1"], // sorting direction, -1 or 1
			["dInfo", "U1"], // detection info
			["Ns", "U2"], // number of samples per beam = Ns, 1 ~
			["centreSampleNum", "U2"], // centre sample number, 1 ~
		]);

		static STRUCT_SEABED89_TAIL = new Map([
			["spareEOS", "U1"],
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMSeabedImage89.STRUCT_SEABED89_HEAD);
		static ReadEntry = ParserA.CreateReader(EMSeabedImage89.STRUCT_SEABED89_ENTRY);
		static ReadTail = ParserA.CreateReader(EMSeabedImage89.STRUCT_SEABED89_TAIL);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();
			const endian = false === littleEndian ? false : true;

			EMSeabedImage89.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);
			const num = result.get('numValidBeams').v;

			let seq = offset + EMSeabedImage89.ReadHead._size;
			let sumNs = 0;

			for (let i = 0; i < num; i++) {
				const entry = new Map();
				EMSeabedImage89.ReadEntry._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMSeabedImage89.ReadEntry._size;

				const Ns = entry.get('Ns').v;
				sumNs = sumNs + Ns;

				for (const [k, v] of entry.entries()) {
					result.set(`e${i + 1}_` + k, v);
				}
			}

			// 2nd entries
			for (let i = 0; i < sumNs; i++) {
				const seqOffset = seq + (2 * i);
				const another = dataView.getInt16(seqOffset, endian);
				result.set(`amplitudes${i + 1}`, ParserA.Describe(another, 'I2', 2));
				// Sample amplitudes in 0.1dB Example: -30.2 dB = FED2h = 65234d
			}

			seq = seq + (2 * sumNs);

			EMSeabedImage89.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMRawRangeAngle78 {
		static TYPES = [0x4E, 0x78];
		static IsMyType(type) {
			return -1 < EMRawRangeAngle78.TYPES.findIndex(d => d === type);
		}

		static STRUCT_RAW78_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"], // Ping counter (sequential counter), 0 ~ 65535
			["serial", "U2"], // system serial number, 100 ~
			["ssTrans", "U2"], // Sound speed at transducer in 0.1 m/s, 14000 ~ 16000
			["Ntx", "U2"], // Number of transmit sectors = Ntx, 1 ~
			["Nrx", "U2"], // Number of receiver beams in datagram = Nrx
			["numValidDetect", "U2"], // Number of valid detections, 1 ~
			["sampleFreq", "F4"], // Sampling frequency in Hz
			["dScale", "U4"], // Dscale
		]);

		// Ntx
		static STRUCT_RAW78_ENTRY_NTX = new Map([
			["tiltAngle", "I2"], // Tilt angle re TX array in 0.01 Degree, -2900 ~ 2900
			["focusRange", "U2"], // Focus range in 0.1 m (0 = No focusing applied), 0 ~ 65534
			["sigLen", "F4"], // Signal length in s
			["secTransDelay", "F4"], // Sector transmit delay re first TX pulse, in s
			["centreFreq", "F4"], // Centre frequency in Hz
			["meanAbsorpCoeff", "U2"], // Mean absorption coeff. in 0.01 dB/km
			["sigId", "U1"], // Signal waveform identifier, 0 ~ 99
			["transSecNum", "U1"], // Transmit sector number / TX array index
			["sigBandwidth", "F4"], // Signal bandwidth in Hz

		]);

		// Nrx
		static STRUCT_RAW78_ENTRY_RTX = new Map([
			["beamAngle", "I2"], // Beam pointing angle re RX array in 0.01 Degree, -11000 ~ 11000
			["transSecNum", "U1"], // Transmit sector number
			["dInfo", "U1"], // Detection info
			["windowLen", "U2"], // Detection window length in samples
			["qFac", "U1"], // Quality factor, 0 ~ 254
			["dCorr", "I1"], // D corr
			["twoTT", "F4"], // Two way travel time in s
			["BS", "I2"], // Reflectivity (BS) in 0.1dB resolution
			["cInfo", "I1"], // Real time cleaning info
			["spare", "U1"],
		]);

		static STRUCT_RAW78_TAIL = new Map([
			["spareEOS", "U1"],
			["etx", "U1"],
			["checksum", "U2"]
		]);

		static ReadHead = ParserA.CreateReader(EMRawRangeAngle78.STRUCT_RAW78_HEAD);
		static ReadEntryTX = ParserA.CreateReader(EMRawRangeAngle78.STRUCT_RAW78_ENTRY_NTX);
		static ReadEntryRX = ParserA.CreateReader(EMRawRangeAngle78.STRUCT_RAW78_ENTRY_RTX);
		static ReadTail = ParserA.CreateReader(EMRawRangeAngle78.STRUCT_RAW78_TAIL);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMRawRangeAngle78.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);

			// -- ntx
			const ntx = result.get('Ntx').v;

			let seq = offset + EMRawRangeAngle78.ReadHead._size;

			for (let i = 0; i < ntx; i++) {
				const entry = new Map();
				EMRawRangeAngle78.ReadEntryTX._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMRawRangeAngle78.ReadEntryTX._size;

				for (const [k, v] of entry.entries()) {
					result.set(`ntx${i + 1}_` + k, v);
				}
			}

			// -- nrx
			const nrx = result.get('Nrx').v;

			for (let i = 0; i < nrx; i++) {
				const entry = new Map();
				EMRawRangeAngle78.ReadEntryRX._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + EMRawRangeAngle78.ReadEntryRX._size;

				for (const [k, v] of entry.entries()) {
					result.set(`nrx${i + 1}_` + k, v);
				}
			}

			EMRawRangeAngle78.ReadTail._toDescribeMap(dataView, seq, result, littleEndian);

			return result;
		}
	}

	class EMExtra {
		static TYPES = [0x33];
		static IsMyType(type) {
			return -1 < EMExtra.TYPES.findIndex(d => d === type);
		}

		static STRUCT_EXTRA_HEAD = new Map([
			["length", "U4"],
			["stx", "U1"],
			["type", "U1"],
			["model", "U2"],
			["date", "U4"],
			["time", "U4"],
			["pingCounter", "U2"],
			["serial", "U2"],
			["contentID", "U2"], // Content identifier
		]);

		static ReadHead = ParserA.CreateReader(EMExtra.STRUCT_EXTRA_HEAD);
		static ReadContentID6 = (dataView, offset, result, littleEndian) => {
			const endian = false === littleEndian ? false : true;
			const Nc = dataView.getUint16(offset, endian); // Number of bytes in text string
			result.set('Nc', ParserA.Describe(Nc, 'U2', 2));

			const ascii = ParserA.ParseAscii(dataView, offset + 2, offset + 2 + Nc);
			result.set('content', ParserA.Describe(ascii, 'A' + Nc, Nc));

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			EMExtra.ReadHead._toDescribeMap(dataView, offset, result, littleEndian);
			let seq = EMExtra.ReadHead._size;

			const contentID = result.get('contentID').v;
			// -- only type 6 implemented
			if (6 === contentID) {
				EMExtra.ReadContentID6(dataView, offset + seq, result, littleEndian);
				// -- hardcoded
				seq = 2 + seq + result.get('Nc').v;
			}

			// -- one more spare byte can be added, if theres a bug, add it
			describeEOS(dataView, seq, result, littleEndian);

			return result;
		}
	}

	function ParseDateTime(date, time) {
		const year = parseInt(date / 10000);
		const month = parseInt((date / 100) % 100);
		const day = parseInt(date % 100);
		const timeS = parseInt(time / 1000);
		const hour = parseInt(timeS / 60 / 60);
		const minute = parseInt((timeS / 60) % 60);
		const second = parseInt((time / 1000) % 60);
		const ms = parseInt(time % 1000);

		const str = `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;

		return new Date(str);
	}

	// -- internal function spare, etx, checksum
	function describeEOS(dataView, start, result, littleEndian) {
		let seq = start;
		const endian = false === littleEndian ? false : true;

		const v1 = dataView.getUint8(seq, endian);
		if (0 === v1) {
			seq++;
			result.set('spareEOS', ParserA.Describe(0, 'U1', 1));
		}

		const etx = dataView.getUint8(seq++, endian);
		result.set('etx', ParserA.Describe(etx, 'U1', 1));

		const checksum = dataView.getUint16(seq++, endian);
		result.set('checksum', ParserA.Describe(checksum, 'U2', 2));
	}

	const GetParser = (() => {
		const clsMap = new Map();
		const list = [
			EMXYZ88,
			EMPosition,
			EMDepthDatagram,
			EMRuntimeParam,
			EMParamInstall,
			EMSoundSpeedProfile,
			EMPUID,
			EMNetworkAttitudeVelocity,
			EMClock,
			EMAttitude,
			EMSeabedImage,
			EMSeabedImage89,
			EMPUStatusOutput,
			EMRawRangeAngle78,
			EMExtra,
		];

		list.forEach(cls => {
			cls.TYPES.forEach(type => {
				clsMap.set(type, cls);
			})
		});

		return (type) => {
			return clsMap.get(type);
		}
	})();

	// -- to create a smaller dataView
	function SliceToSection(section, dataView) {
		const result = new DataView(dataView.buffer, section.offset, section.len + EMAll.BYTE_LENGTH);
		return result;
	}

	// -- Map.v to Map

	class ParserContextBasic_EM {
		constructor() {
			this.mb = undefined;
			this.sections = undefined;
			this.isLE = true;

			this.positions = undefined;
			this.xyz = undefined;
			this.lines = undefined;
		}

		load(mb, sections, littleEndian) {
			this.mb = mb;
			this.sections = sections;
			this.isLE = littleEndian;

			this.typeXYZ = this.judgeXYZ();
		}

		judgeXYZ() {
			const typeXYZ = 0x58;
			const typeDD = 0x44;

			if (-1 < this.sections.findIndex(d => typeXYZ === d.type)) {
				return typeXYZ;
			}

			if (-1 < this.sections.findIndex(d => typeDD === d.type)) {
				return typeDD;
			}
		}

		parsePosition() {
			const result = [];

			const type = 0x50;
			const cls = GetParser(type);

			for (let i = 0; i < this.sections.length; i++) {
				const s = this.sections[i];
				if (type === s.type) { // 0x50 position
					const r = cls.ParseSectionMinimum(this.mb, s.offset, s.length);
					result.push(r);
				}
			}

			this.positions = result;
		}

		parseXYZ() {
			const result = [];

			const type = this.typeXYZ;
			const cls = GetParser(type);

			for (let i = 0; i < this.sections.length; i++) {
				const s = this.sections[i];
				if (0x44 === s.type) { // 0x44 Depth datagram
					const r = cls.ParseSectionMinimum(this.mb, s.offset, s.length);
					result.push(r);
				} else if(0x58 === s.type) {
					const r = cls.ParseSectionMinimum(this.mb, s.offset, s.length);
					result.push(r);
				}
			}

			this.xyz = result;
		}

		calcPositionWithXYZ() {
			const result = Array(this.xyz.length);
			for (let i = 0; i < this.xyz.length; i++) {
				// item[3] : txDepth, item[4] : body[400]
				const item = this.xyz[i];
				const r1 = this.findNearestPosition(item[0], item[1]);

				const body = item[4];

				const line = [];

				const x = body.map(d => d[0]);

				const pos1 = ParserContextBasic_EM.destVincentyArray(r1[2], r1[3], r1[4], x);

				for (let j = 0; j < body.length; j++) {
					const b = body[j];
					// b[0] : x, b[1] : y, b[2] : z
					const pos2 = ParserContextBasic_EM.destVincenty(pos1[j][0], pos1[j][1], r1[4] + 90, b[1]);
					line.push([pos2[0], pos2[1], item[3] + b[2]]);
				}

				result[i] = line;
			}

			this.lines = result;
		}

		_debugcalcPositionWithXYZ() {
			const result = [];
			for (let i = 0; i < this.xyz.length; i++) {
				// item[3] : txDepth, item[4] : body[400]
				const item = this.xyz[i];
				const r1 = this.findNearestPosition(item[0], item[1]);

				const body = item[4];

				const line = [];
				for (let j = 0; j < body.length; j++) {
					const b = body[j];
					// b[0] : x, b[1] : y, b[2] : z
					const pos1 = ParserContextBasic_EM.destVincenty(r1[2], r1[3], r1[4], b[0]);
					const pos2 = ParserContextBasic_EM.destVincenty(pos1.lat, pos1.lng, r1[4] + 90, b[1]);

					line.push([pos2.lat, pos2.lng, item[3] + b[2]]);
				}

				result.push(line);
			}

			this.lines2 = result;
		}


		_testFindNearest() {
			for (let i = 0; i < this.xyz.length; i++) {
				const item = this.xyz[i];
				const r1 = this.findNearestPosition(item[0], item[1]);
				const r2 = this.findNearestPositionLinear(item[0], item[1]);

				if (r1 !== r2) {
					console.log(`is diff ${item[0]} ${item[1]} at [${i}]`);
					console.log(r1, r2);
					const diff1 = [r1[0] - item[0], r1[1] - item[1]];
					const diff2 = [r2[0] - item[0], r2[1] - item[1]];
					console.log(diff1, diff2);

					break;
				}
			}
		}

		_debugFindNearest(idx) {
			const item = this.xyz[idx];
			const r1 = this.findNearestPosition(item[0], item[1]);
			const r2 = this.findNearestPositionLinear(item[0], item[1]);

			if (r1 !== r2) {
				console.log(`is diff ${item[0]} ${item[1]} at [${idx}]`);
				console.log(r1, r2);
				const diff1 = [r1[0] - item[0], r1[1] - item[1]];
				const diff2 = [r2[0] - item[0], r2[1] - item[1]];
				console.log(diff1, diff2);
			}
		}

		// https://stackoverflow.com/questions/8584902/get-the-closest-number-out-of-an-array
		findNearestPosition(date, time) {
			// -- if it fails, use _testFindNearest, _debugFindNearest
			let mid;
			let lo = 0;
			let hi = this.positions.length - 1;
			while (hi - lo > 1) {
				mid = Math.floor((lo + hi) / 2);
				if (this.positions[mid][0] < date) {
					lo = mid;
				} else if (this.positions[mid][0] === date) {
					if (this.positions[mid][1] < time) {
						lo = mid;
					} else {
						hi = mid;
					}
				} else {
					hi = mid;
				}
			}

			if (hi === lo) {
				return this.positions[lo];
			}

			const rlo = this.positions[lo];
			const rhi = this.positions[hi];

			const diff1 = [Math.abs(date - rlo[0]), Math.abs(time - rlo[1])];
			const diff2 = [Math.abs(date - rhi[0]), Math.abs(time - rhi[1])];

			if (diff1[0] > diff2[0]) {
				return rhi;
			} else if (diff1[0] < diff2[0]) {
				return rlo;
			} else {
				if (diff1[1] > diff2[1]) {
					return rhi;
				}

				return rlo;
			}
		}

		findNearestPositionLinear(date, time) {
			return this.positions.reduce((rlo, rhi) => {
				const diff1 = [Math.abs(date - rlo[0]), Math.abs(time - rlo[1])];
				const diff2 = [Math.abs(date - rhi[0]), Math.abs(time - rhi[1])];

				if (diff1[0] > diff2[0]) {
					return rhi;
				} else if (diff1[0] < diff2[0]) {
					return rlo;
				} else {
					if (diff1[1] > diff2[1]) {
						return rhi;
					}

					return rlo;
				}
			})
		}

		clearMemory() {
			this.positions = [];
			this.xyz = [];

			this.sections = [];
			this.mb = undefined;
		}

		static destVincentyArray(lat1, lon1, brng, arrDist) {
			const result = [];
			const a = 6378137,
				b = 6356752.3142,
				f = 1 / 298.257223563, // WGS-84 ellipsiod
				//s = dist,
				alpha1 = brng * Math.PI / 180,
				sinAlpha1 = Math.sin(alpha1),
				cosAlpha1 = Math.cos(alpha1),
				tanU1 = (1 - f) * Math.tan(lat1 * Math.PI / 180),
				cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)), sinU1 = tanU1 * cosU1,
				sigma1 = Math.atan2(tanU1, cosAlpha1),
				sinAlpha = cosU1 * sinAlpha1,
				cosSqAlpha = 1 - sinAlpha * sinAlpha,
				uSq = cosSqAlpha * (a * a - b * b) / (b * b),
				A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq))),
				B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

			for (let i = 0; i < arrDist.length; i++) {
				const dist = arrDist[i];
				const s = dist;
				let sigma = s / (b * A), sigmaP = 2 * Math.PI;

				while (Math.abs(sigma - sigmaP) > 1e-12) {
					var cos2SigmaM = Math.cos(2 * sigma1 + sigma),
						sinSigma = Math.sin(sigma),
						cosSigma = Math.cos(sigma),
						deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
					sigmaP = sigma;
					sigma = s / (b * A) + deltaSigma;
				};

				var tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1,
					lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)),
					lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1),
					C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha)),
					L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))),
					revAz = Math.atan2(sinAlpha, -tmp); // final bearing

				result.push([lat2 * 180 / Math.PI, lon1 + L * 180 / Math.PI]);
			}

			return result;
		}

		static destVincenty(lat1, lon1, brng, dist) {
			var a = 6378137,
				b = 6356752.3142,
				f = 1 / 298.257223563, // WGS-84 ellipsiod
				s = dist,
				alpha1 = brng * Math.PI / 180,
				sinAlpha1 = Math.sin(alpha1),
				cosAlpha1 = Math.cos(alpha1),
				tanU1 = (1 - f) * Math.tan(lat1 * Math.PI / 180),
				cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)), sinU1 = tanU1 * cosU1,
				sigma1 = Math.atan2(tanU1, cosAlpha1),
				sinAlpha = cosU1 * sinAlpha1,
				cosSqAlpha = 1 - sinAlpha * sinAlpha,
				uSq = cosSqAlpha * (a * a - b * b) / (b * b),
				A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq))),
				B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq))),
				sigma = s / (b * A),
				sigmaP = 2 * Math.PI;
			while (Math.abs(sigma - sigmaP) > 1e-12) {
				var cos2SigmaM = Math.cos(2 * sigma1 + sigma),
					sinSigma = Math.sin(sigma),
					cosSigma = Math.cos(sigma),
					deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
				sigmaP = sigma;
				sigma = s / (b * A) + deltaSigma;
			};
			var tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1,
				lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)),
				lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1),
				C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha)),
				L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))),
				revAz = Math.atan2(sinAlpha, -tmp); // final bearing
			return [lat2 * 180 / Math.PI, lon1 + L * 180 / Math.PI];
		}

		static CreateInstanceFrom(object) {
			const instance = new ParserContextBasic_EM();
			instance.mb = object.mb;
			instance.sections = object.sections;
			instance.isLE = object.isLE;

			instance.positions = object.positions;
			instance.xyz = object.xyz;
			instance.lines = object.lines;
			return instance;
		}

	}


	class ParserTest_EM {
		static LoadArrayBuffer(ab) {
			let isLE = true;

			// -- check if its LE or BE
			const dv = new DataView(ab);
			const leLength = dv.getUint32(0, true);
			const beLength = dv.getUint32(0, false);
			if (leLength > beLength) {
				isLE = false;
			}

			const mb = ParserTest_EM.ParseSectionTable(ab, isLE);

			const sections = mb.sectionTable;
			sections.forEach((d, i) => d.title = ParserEM.EMAll.DescType(d.type));

			return mb;
		}

		static ParseSectionTable(ab, littleEndian) {
			const mb = new EMAll(ab);

			mb.littleEndian = littleEndian;

			const sectionTable = mb.parseBrief();

			return {
				dataView: mb,
				sectionTable: sectionTable,
				littleEndian: littleEndian,
			}
		}
	}

	/*
	Parser A : Basic structures, static functions
	Parser B : Convert value to meaningful value, static functions
	Parser C : Make context, explain, use it as class instance
	Parser Entry : Entry point to load array buffer
	*/
	return {
		// -- Parser A
		EMAll: EMAll,
		EMXYZ88: EMXYZ88,
		EMParamInstall: EMParamInstall,
		EMRuntimeParam: EMRuntimeParam,
		EMPosition: EMPosition,
		EMDepthDatagra: EMDepthDatagram,
		EMSoundSpeedProfile: EMSoundSpeedProfile,
		EMPUID: EMPUID,
		EMNetworkAttitudeVelocity: EMNetworkAttitudeVelocity,
		EMClock: EMClock,
		EMAttitude: EMAttitude,
		EMSeabedImage: EMSeabedImage,
		EMSeabedImage89: EMSeabedImage89,
		EMPUStatusOutput: EMPUStatusOutput,
		EMRawRangeAngle78: EMRawRangeAngle78,
		EMExtra: EMExtra,
		// ParserA.CreateReader: ParserA.CreateReader,
		// ParserA.ParseAscii: ParserA.ParseAscii,
		GetParser: GetParser,
		SliceToSection: SliceToSection,
		// Undescribe: Undescribe,
		// UndescribeMap: UndescribeMap,

		// -- Parser B
		// ParseBit: ParseBit,
		// ParserA.ParseBitEqual: ParserA.ParseBitEqual,
		ParseDateTime: ParseDateTime,
		// ParsedBitJoin: ParsedBitJoin, // result to string from ParseBit or ParserA.ParseBitEqual

		// -- Parser C
		ParserContext: ParserContextBasic_EM,

		// -- Parser Entry
		ParserTest: ParserTest_EM,

	};
})();
const ParserSEGY = (() => {
	class SEGY {
		static TYPES = [0x01];
		static IsMyType(type) {
			return -1 < SEGY.TYPES.findIndex(d => d === type);
		}
		static TITLE = 'BinHeader';

		static STRUCT_BINARY_HEADER3200 = new Map([
			['jobIDNum', 'U4'], // 4 3201-3204
			['lineNum', 'U4'], // 4 3205-3208
			['reelNum', 'U4'], // 4 3209-3212
			['tracesPEns', 'U2'], // 3213-3214 Number of data traces per ensemble. Mandatory for prestack data.
			['auxTracesPEns', 'U2'], // 3215-3216 Number of auxiliary traces per ensemble. Mandatory for prestack data.
			['interval', 'U2'], // 3217-3218 Sample interval. Microseconds (µs) for time data, Hertz (Hz) for frequencydata, meters (m) or feet (ft) for depth data.
			['intervalOrg', 'U2'], // 3219-3220 Sample interval of original field recording. Microseconds (µs) for time data, Hertz (Hz) for frequency data, meters (m) or feet (ft) for depth data.
			['numSamplePTrace', 'U2'], // 3221-3222 Number of samples per data trace.
			['numSamplePTraceOrg', 'U2'], // 3223-3224 Number of samples per data trace for original field recording.
			['code', 'U2'], // 3225-3226 Data sample format code. Mandatory for all data. These formats are described in Appendix E.
			['ensFold', 'U2'], // 3227-3228 Ensemble fold,  The expected number of data traces per trace ensemble
			['traceSortingCode', 'U2'], // 3229-3230 Trace sorting code, type of ensemble, -1 ~ 9
			['vertSumCode', 'U2'], // 3231-3232 Vertical sum code, 1 = no sum, 2 = two sum
			['sweepFreqStart', 'U2'], // 3233-3234 Sweep frequency at start (Hz).
			['sweepFreqEnd', 'U2'], // 3235-3236 Sweep frequency at end (Hz).
			['sweepLen', 'U2'], // 3237-3238 Sweep length (ms).
			['sweepTypeCode', 'U2'], // 3239-3240 Sweep type code: 1 ~ 4

			['traceNumSweepChannel', 'U2'], // 3241-3242 Trace number of sweep channel.
			['sweepTTLenStart', 'U2'], //  3243-3244 Sweep trace taper length in milliseconds at start if tapered (the taper starts at zero time and is effective for this length).
			['sweepTTLenEnd', 'U2'], // 3245-3246 Sweep trace taper length in milliseconds at end (the ending taper starts at sweep length minus the taper length at end).
			['taperType', 'U2'], // 3247-3248 Taper type: 1 ~ 3
			['corelTrace', 'U2'], // 3249-3250 Correlated data traces: 1 = no, 2 = yes
			['binGainRec', 'U2'], // 3251-3252 Binary gain recovered: 1 = yes, 2 = no
			['ampRecM', 'U2'], // 3253-3254 Amplitude recovery method: 1 ~ 4
			['measureSystem', 'U2'], // 3255-3256 Measurement system, 1 = Meter, 2 = Feet
			['impulseSigPol', 'U2'], // 3257-3258 Impulse signal polarity, 1 = negative number on trace, 2 = positive number on trace
			['vibPolCode', 'U2'], // 3259-3260 Vibratory polarity code:, 1 ~ 8
			['extNumTracePEns', 'U4'], // 3261-3264 Extended number of data traces per ensemble. If nonzero, this overrides the number of data traces per ensemble in bytes 3213-3214. [tracesPEns]
			['extNumAuxTracePEns', 'U4'], // 3265-3268 Extended number of auxiliary traces per ensemble. If nonzero, this overrides the number of auxiliary traces per ensemble in bytes 3215-3216. [auxTracesPEns]
			// -- missed
			['extNumSample', 'U4'], // 3269-3272 Extended number of samples per data trace. If nonzero, this overrides the number of samples per data trace in bytes 3221-3222.
			['extInterval', 'F8'], // 3273-3280 Extended sample interval, IEEE double precision (64-bit). If nonzero, this overrides the sample interval in bytes 3217-3218 with the same units. [interval]
			['extIntervalOrG', 'F8'], // 3281-3288 Extended sample interval of original field recording, IEEE double precision [intervalOrg]
			['extNumSamplePTraceOrg', 'U4'], // 3289-3292 Extended number of samples per data trace in original recording. If nonzero, this overrides the number of samples per data trace in original recording in bytes 3223-3224. [numSamplePTraceOrg]
			['extEnsFold', 'U4'], // 3293-3296 Extended ensemble fold. If nonzero, this overrides ensemble fold in bytes 3227-3228. [ensFold]
			['constant1234', 'U4'], //  Integer constant 0x01020304 for endianess
		]);

		// extNumSample added, I missed before

		static STRUCT_BINARY_HEADER3500 = new Map([
			['majorRev', 'U1'], // Major SEG-Y format revision number
			['minorRev', 'U1'], // Minor SEG-Y format revision number
			['fixedLenTrace', 'U2'], // Fixed length trace flag
			['numExtTextHDR', 'U2'], // Number of 3200byte, Extended Textual file header records following the binary header
			['numAddTraceHDR', 'U4'], // Maximum number of additional 240 byte trace headers
			['timeCode', 'U2'], // Time basis code, 1 ~ 5
			['numTraceInFile', 'U8'], // Number of traces in this file or stream
			['offsetTrace', 'U8'], // Byte offset of first trace relative to start of file or stream, include initial 3600 bytes
			['numTrailerStanza', 'I4'], // Number of 3200byte date trailer stanza records following the last trace
		]);


		// -- binHeader.code, usually 5 with normal Floating point
		// static SAMPLE_FORMAT_CODE_OLD = {
		// 	IBM_FP_4: 1,
		// 	TWO_COMPLEMENT_INT_4: 2,
		// 	TWO_COMPLEMENT_INT_2: 3,
		// 	FIXED_POINT_GAIN_4: 4,
		// 	IEEE_FP_4: 5,
		// 	IEEE_FP_8: 6,
		// 	TWO_COMPLEMENT_INT_3: 7,
		// 	TWO_COMPLEMENT_INT_1: 8,
		// 	TWO_COMPLEMENT_INT_8: 9,
		// 	UINT_4: 10,
		// 	UINT_2: 11,
		// 	UINT_8: 12,
		// 	UINT_3: 15,
		// 	UINT_1: 16
		// };

		// -- value, string, byte
		static SAMPLE_FORMAT_CODE = [
			[1, "4-byte IBM floating-point", 4, 'F'],
			[2, "4-byte, two's complement integer", 4, 'I'],
			[3, "2-byte, two's complement integer", 2, 'I'],
			[4, "4-byte fixed-point with gain (obsolete)", 4, 'I'],
			[5, "4-byte IEEE floating-point", 4, 'F'],
			[6, "8-byte IEEE floating-point", 8, 'F'],
			[7, "3-byte two's complement integer", 3, 'I'],
			[8, "1-byte, two's complement integer", 1, 'I'],
			[9, "8-byte, two's complement integer", 8, 'I'],
			[10, "4-byte, unsigned integer", 4, 'I'],
			[11, "2-byte, unsigned integer", 2, 'I'],
			[12, "8-byte, unsigned integer", 8, 'I'],
			[15, "3-byte, unsigned integer", 3, 'I'],
			[16, "1-byte, unsigned integer", 1, 'I'],
		];

		// -- code is 1 ~ 16, not an object
		static FindSampleFormatCode(code) {
			const sampleCodeFound = SEGY.SAMPLE_FORMAT_CODE.find(d => code === d[0]);
			return sampleCodeFound;
		}

		static DATE_TIME_CODE = {
			1: 'Local',
			2: 'GMT',
			3: 'Other',
			4: 'UTC',
			5: 'GPS'
		};

		static ReadBinaryHeader3200 = ParserA.CreateReader(SEGY.STRUCT_BINARY_HEADER3200);
		static ReadBinaryHeader3500 = ParserA.CreateReader(SEGY.STRUCT_BINARY_HEADER3500);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();
			const SIZE_BIN_HEADER = 300;

			// -- offset is absolute 3200, 3500 but just in case
			SEGY.ReadBinaryHeader3200._toDescribeMap(dataView, offset, result, littleEndian);

			// -- unassigned 3301 ~ 3500
			const length = SIZE_BIN_HEADER - SEGY.ReadBinaryHeader3200._size;
			for (let i = 0; i < length / 4; i++) {
				result.set(`un_${i + 1}`, ParserA.Describe(0, 'U', 4));
			}

			SEGY.ReadBinaryHeader3500._toDescribeMap(dataView, offset + SIZE_BIN_HEADER, result, littleEndian);

			return result;
		}

		/**
		 * Convert Seconds of arc to degree
		 */
		static SOA2Degree(sec) {
			const degree = sec / 3600;
			return degree;
		}

		parseDetail() {
			this.setLittleEndian(false);
			const h1 = this.parse(SegY.STRUCT_BINARY_HEADER3200, 3200);
			const h2 = this.parse(SegY.STRUCT_BINARY_HEADER3500, 3500);

			// -- Merge to h1
			Object.keys(h2).forEach((k, v) => h1[k] = v);
			this.saveBrief(h1);

			this.setParseOffset(3600);

			// -- No way that I can check the number of traces in the file
			const listTrace = [];

			if (SegY.SAMPLE_FORMAT_CODE.IBM_FP_4 !== h1.code
				&& SegY.SAMPLE_FORMAT_CODE.IEEE_FP_4 !== h1.code) {
				alert(`Only 32bit floating point implemented, please report`);
			} else {
				this.setLittleEndian(false);
				while (this.parseOffset < this.byteLength) {
					const trace = this.parseTraceOne();
					listTrace.push(trace);
				}

				return {
					binHeader: h1,
					traces: listTrace
				};
			}
		}

		parseTraceOne() {
			const traceHeader = this.parse(SegY.STRUCT_TRACE_HEADER);
			const parsedHeader = {};

			// -- Date
			const date = new Date();
			date.setUTCFullYear(traceHeader.year);
			date.setUTCMonth(0);
			date.setUTCDate(traceHeader.day);
			date.setUTCHours(traceHeader.hour);
			date.setUTCMinutes(traceHeader.minute);
			date.setUTCSeconds(traceHeader.second);
			date.setUTCMilliseconds(0);

			parsedHeader.date = date;
			parsedHeader.dateBase = SegY.DATE_TIME_CODE[traceHeader.timeCode];

			// -- Coordinates
			if (2 === traceHeader.coordUnit) {
				// -- 2 is seconds of arc which is deprecated but they are using
				// it says divide it with 3600 but thats not I guess
				const lng = traceHeader.srcCoordX / (3600 * 1000);
				const lat = traceHeader.srcCoordY / (3600 * 1000);
				parsedHeader.srcPos = [lat, lng];
				// parsedHeader.srcPosStr = 'seconds of arc, lat, lng';
			}

			this.addParseOffset(10);
			const traceData = [];

			for (let i = 0; i < traceHeader.numSample; i++) {
				// -- consider it is code 5 IEEE 32bit floating point
				// TODO check the code

				const v = this.getFloat32(this.parseOffset);
				traceData.push(v);
				this.parseOffset = this.parseOffset + 4;
			}
			return {
				header: traceHeader,
				parsedHeader: parsedHeader,
				data: traceData
			}
		}

		getPrettyPrintBinHeader() {
			const brief = this.getBrief();
			if (!brief) {
				return 'Not yet parsed, or invalid';
			}

			const list = [
				`Major: ${brief.majorRev}, Minor: ${brief.minorRev}`,
				`Data format code: ${brief.code} - ${this.getCodeStr(brief.code)}`,
				`Sample per trace: ${brief.numSamplePTrace}`,
				`Interval: ${brief.interval}us`,
			];

			return list.join('\n');
		}

		// -- code 1 ~ 16
		getCodeStr(code) {
			let result = '';
			Object.keys(SegY.SAMPLE_FORMAT_CODE).forEach((k) => {
				const v = SegY.SAMPLE_FORMAT_CODE[k];
				if (v === code) {
					result = k;
				}
			});

			return result;
		}
	}

	class SEGYTrace {
		static TYPES = [0x02];
		static IsMyType(type) {
			return -1 < SEGYTrace.TYPES.findIndex(d => d === type);
		}
		static TITLE = 'Trace';

		static STRUCT_TRACE_HEADER = new Map([
			['traceSeqLine', 'U4'], // Trace sequence number within line
			['traceSeqFile', 'U4'], // Trace sequence number within SEG-Y file
			['orgFieldRecNum', 'U4'], // Original field record number
			['traceNumOrg', 'U4'], // Trace number within the original field record
			['energySrc', 'U4'], // Energy source point number
			['ensNum', 'U4'], // Ensemble number
			['traceNumEns', 'U4'], // Trace number within the ensemble
			['traceIDCode', 'U2'], // -1 ~ 41, ~
			['numVertSum', 'U2'], // Number of vertically summed traces yielding this trace, 1 is one trace, 2 is two summed traces
			['numHoriSum', 'U2'], // Number of horizontally stacked traces yielding this trace
			['dataUse', 'U2'], // Data Use, 1 = Production, 2 = Test
			['distCent', 'U4'], // Distance from center of the source point to the center of the receiver group
			['elevRecv', 'U4'], // Elevation of receiver group
			['surfElev', 'U4'], // Surface elevation at source location
			['srcDepth', 'U4'], // Source depth below surface
			['seisDatumRecv', 'U4'], // Seismic Datum elevation at receiver group
			['seisDatumSrc', 'U4'], // Seismic Datum elevation at source
			['watColHeiSrc', 'U4'], // Water column height at source location
			['watColHeiRecv', 'U4'], // Water column height at receiver group location
			['scalarElev', 'I2'], // Scalar to be applied to all elevations and depths specified in Standrad Trace Header bytes 41-68 to give thre real value
			['scalarCoord', 'I2'], // Scalar to be applied to all coordinates specified in Standard Trace Header bytes 73–88 and to bytes Trace Header 181–188 to give the real value
			['srcCoordX', 'I4'], // Source coordinate X
			['srcCoordY', 'I4'], // Source coordinate Y
			['grpCoordX', 'I4'], // Group coordinate X
			['grpCoordY', 'I4'], // Group coordinate Y
			['coordUnit', 'U2'], // Coordinate unit, 1 = Length(meter or feet), 2 = Seconds of arc(deprecated), 3 = Decimal degrees, 4 = DMS
			['weatherVel', 'U2'], // Weathering velocity, ft/s or m/s
			['subWeatherVel', 'U2'], // Subweathering velocity, ft/s or m/s
			['upSrcMS', 'U2'], // Uphole time at source in milliseconds
			['upGrpMS', 'U2'], // Uphole time at group in milliseconds
			['srcCorrMS', 'U2'], // Source static correction in milliseconds
			['grpCorrMS', 'U2'], // Group static correction in milliseconds
			['totMS', 'U2'], // Total static applied in milliseconds
			['lagAMS', 'U2'], // Lag time A - time in milliseconds between end of 240 byte trace identification header and time break
			['lagBMS', 'U2'], // Lag time A - time in milliseconds between time break and the initiation time of the energy source
			['delayRecMS', 'U2'], // Delay recording time - time in milliseconds between initiation time of energy source and the time when recording of data samples begins
			['muiteStartMS', 'U2'], // Mute time - start time in milliseconds
			['muiteEndMS', 'U2'], // Mute time - end time in milliseconds
			['numSample', 'U2'], // Number of samples in this trace
			['intervalSample', 'U2'], // Sample interval for this trace, Microseconds, Hz, meter / feet
			['gainType', 'U2'], // Gain type of field instruments, 1 = fixed, 2 = binary, 3 = floating point, 4 ~ optional
			['instGain', 'U2'], // Insturment gain constant (dB)
			['instInitGain', 'U2'], // Instrument early or initial gain (dB)
			['correlated', 'U2'], // Correlated 1 = no, 2 = yes
			['sweepFreqS', 'U2'], // Sweep frequency at start Hz
			['sweepFreqE', 'U2'], // Sweep frequency at end Hz
			['sweepLen', 'U2'], // Sweep length in milliseconds
			['sweepType', 'U2'], // Sweep type : 1 = linear, 2 = parabolic, 3 = exponential, 4 = other
			['sweepTraceLenS', 'U2'], // Sweep trace taper length at start in milliseconds
			['sweepTraceLenE', 'U2'], // Sweep trace taper length at end in milliseconds
			['taperType', 'U2'], // Taper type
			['aliasFFreq', 'U2'], // Alias filter frequency Hz
			['aliasFSlope', 'U2'], // Alias filter slope dB/octave
			['notchFFreq', 'U2'], // Notch filter frequency Hz
			['notchFSlope', 'U2'], // Notch filter slope dB/octave
			['lcFreq', 'U2'], // Low cut frequency Hz
			['hcFreq', 'U2'], // High cut frequency Hz
			['lcSlope', 'U2'], // Low cut slope dB/octave
			['hcSlope', 'U2'], // High cut slope dB/octave
			['year', 'U2'], // year data recorded
			['day', 'U2'], // Day of year 1 ~ 366
			['hour', 'U2'], // Hour of day 24h
			['minute', 'U2'], // Minute of hour
			['second', 'U2'], // seconds of minute
			['timeCode', 'U2'], // Time basis code, 1 ~ 5 will overrides the binary header if exist
			['traceWeiFac', 'U2'], // Trace weighting factor
			['geoGNRoll', 'U2'], // Geophone group number of roll switch position one
			['geoGNTrace', 'U2'], // Geophone group number of trace number one within original field record
			['geoGNLTrace', 'U2'], // Geophone group number of last trace within original field record
			['gapSize', 'U2'], // Gap size, total number of groups dropped
			['overTravel', 'U2'], // Over travel associated with taper at beginning or end of line, 1 = down, 2 = up
			['XcoordEns', 'U4'], // X coordinate of ensemble (CDP) position of this trace
			['YcoordEns', 'U4'], // Y coordinate of ensemble (CDP) position of this trace
			['PSinline', 'U4'], // for 3D poststack data, this field should be used for the in-line number
			['PScrossline', 'U4'], // for 3D poststack data, this field should be used for the cross-line number
			['shotpoint', 'U4'], // Shotpoint number
			['scalarShot', 'U2'], // Scalar to be applied to the shotpoint number in Standard Trace Header bytes 197-200 to give the real value
			['traceUnit', 'I2'], // Trace value measurement unit, -1 ~ 9 ~ 256
			['transC', 'U8'], // Transduction constant, 8 byte and... what??
			['transUnit', 'I2'], // Transduction units, -1 ~ 9
			['id', 'U2'], // Device / Trace Identifier
			['scalarTimes', 'U2'], // Scalar to be applied to times specified in Trace header bytes 95-114 to give the true time value in milliseconds
			['srcType', 'I2'], // Source type / Orientation, -1 ~ 9
			['srcEnergyDir', 'U2'], // Source energy direction with respect to the source orientation
			['sourceM1', 'U4'], // Source Measurement 6bytes
			['sourceM2', 'U2'], // Source MEasurement 6bytes
			['srcUnit', 'I2'], // Source measurement unit, -1 ~ 6
			['useless1', 'U4'], // just to byte align
			['useless2', 'U4'], // just to byte align
			['useless3', 'U2'], // just to byte align
		]);

		static ReadTraceHeader = ParserA.CreateReader(SEGYTrace.STRUCT_TRACE_HEADER);

		// -- sampleCode is just number, not object type or what
		static ParseSectionDescribe4F(dataView, offset, littleEndian) {
			const result = new Map();

			SEGYTrace.ReadTraceHeader._toDescribeMap(dataView, offset, result, littleEndian);
			const numSample = result.get('numSample').v;

			for (let i = 0; i < numSample; i++) {
				const dataOffset = (offset + SEGYTrace.ReadTraceHeader._size) + (i * 4);
				const v = dataView.getFloat32(dataOffset, littleEndian);
				result.set('dataF4_' + i, ParserA.Describe(v, 'F4', 4));
			}

			return result;
		}

		// -- trace seq, numSample, interval, date, x, y
		static ParseSection(dataView, offset, littleEndian) {
			const traceSeq = SEGYTrace.ReadTraceHeader.traceSeqLine(dataView, offset, littleEndian);
			const numSample = SEGYTrace.ReadTraceHeader.numSample(dataView, offset, littleEndian);
			const intervalSample = SEGYTrace.ReadTraceHeader.intervalSample(dataView, offset, littleEndian);

			const year = SEGYTrace.ReadTraceHeader.year(dataView, offset, littleEndian);
			const day = SEGYTrace.ReadTraceHeader.day(dataView, offset, littleEndian);
			const hour = SEGYTrace.ReadTraceHeader.hour(dataView, offset, littleEndian);
			const minute = SEGYTrace.ReadTraceHeader.minute(dataView, offset, littleEndian);
			const second = SEGYTrace.ReadTraceHeader.second(dataView, offset, littleEndian);
			const timeCode = SEGYTrace.ReadTraceHeader.timeCode(dataView, offset, littleEndian);

			const date = new Date();
			date.setUTCFullYear(year);
			date.setUTCMonth(0);
			date.setUTCDate(day);
			date.setUTCHours(hour);
			date.setUTCMinutes(minute);
			date.setUTCSeconds(second);
			date.setUTCMilliseconds(0);

			const coordUnit = SEGYTrace.ReadTraceHeader.coordUnit(dataView, offset, littleEndian);
			let lat = 0, lng = 0;

			// -- Coordinates
			if (2 === coordUnit) {
				// -- 2 is seconds of arc which is deprecated but they are using
				// it says divide it with 3600 but thats not I guess
				lng = SEGYTrace.ReadTraceHeader.srcCoordX(dataView, offset, littleEndian) / (3600 * 1000);
				lat = SEGYTrace.ReadTraceHeader.srcCoordY(dataView, offset, littleEndian) / (3600 * 1000);
			}

			return [traceSeq, numSample, intervalSample, date, timeCode, lat, lng];
		}

		static ParseSectionData4F(dataView, offset, littleEndian) {
			const numSample = SEGYTrace.ReadTraceHeader.numSample(dataView, offset, littleEndian);

			const result = [];
			for (let i = 0; i < numSample; i++) {
				const dataOffset = (offset + SEGYTrace.ReadTraceHeader._size) + (i * 4);
				const v = dataView.getFloat32(dataOffset, littleEndian);
				result.push(v);
			}

			return result;
		}

		// -- code from bin header
		static ParseSectionData(dataView, offset, littleEndian, code) {
			const codeFound = SEGY.SAMPLE_FORMAT_CODE.find(item => item[0] === code);

			if(!codeFound) {
				return;
			}

			if(4 === codeFound[2] && 'F' === codeFound[3]) {
				return SEGYTrace.ParseSectionData4F(dataView, offset, littleEndian);
			}
		}
	}

	class ParserTest_SEGY {
		static LoadArrayBuffer(ab) {
			const offsetLineNumber = 3204;
			const offsetTracerPerEnsenble = 3212;

			let isLE = true;

			// -- check if its LE or BE
			const dv = new DataView(ab);

			let le = dv.getUint32(offsetLineNumber, true);
			let be = dv.getUint32(offsetLineNumber, false);

			if (le > be) {
				isLE = false;
			} else if(le === be) {
				le = dv.getUint16(offsetTracerPerEnsenble, true);
				be = dv.getUint16(offsetTracerPerEnsenble, false);

				if(le > be) {
					isLE = false;
				}
			}

			const parsed = ParserTest_SEGY.ParseSectionTable(ab, isLE);

			return parsed;
		}

		static ParseSectionTable(ab, littleEndian) {
			const result = {
				dataView: undefined,
				sections: undefined,
				isLE: littleEndian,

				bin: undefined,
			};

			const sections = [];

			const dv = new DataView(ab);
			const binHeader = SEGY.ParseSectionDescribe(dv, 3200, littleEndian);
			result.dataView = dv;
			result.bin = binHeader;

			const sectionBinHeader = {
				type: SEGY.TYPES[0],
				title: SEGY.TITLE,
				offset: 3200,
				len: 400,
			};

			sections.push(sectionBinHeader);

			const offsetTrace = binHeader.get('offsetTrace').v;

			// -- big int to just int
			// TODO Later big files...
			let offset = 3600 + parseInt(offsetTrace);
			let sampleCode = SEGY.SAMPLE_FORMAT_CODE[4];

			const sampleCodeFound = SEGY.SAMPLE_FORMAT_CODE.find(d => binHeader.get('code').v === d[0]);
			if (undefined === sampleCodeFound) {
				console.error(`Critical error, sample format code is Mandatory for all data but its empty`);
				console.info('Just proceed with 4 byte floating point');
			} else {
				sampleCode = sampleCodeFound;
			}

			const sizeData = sampleCode[2];
			const sizeTraceHeader = SEGYTrace.ReadTraceHeader._size;

			let startOffset = offset;
			// push bin header at first
			while (startOffset < dv.byteLength) {
				const numSample = SEGYTrace.ReadTraceHeader.numSample(dv, startOffset, littleEndian);
				const len = sizeTraceHeader + (numSample * sizeData);

				const s = {
					type: SEGYTrace.TYPES[0],
					title: SEGYTrace.TITLE,
					offset: startOffset,
					len: len
				};

				sections.push(s);

				startOffset = startOffset + len;
			}

			result.sections = sections;

			return result;
		}
	}

	class ParserContextBasic_SEGY {
		constructor() {
			this.dataView = undefined;
			this.sections = undefined;
			this.isLE = true;

			// -- SEGY data
			this.binHeader = undefined;
			this.sampleCode = 0;
			this.sampleCodeFound = undefined;

			// -- after call parse
			this.traces = [];
		}

		load(ab) {
			const parsed = ParserTest_SEGY.LoadArrayBuffer(ab);
			this.dataView = parsed.dataView;
			this.sections = parsed.sections;
			this.isLE = parsed.isLE;
			this.binHeader = parsed.bin;

			this.sampleCode = this.binHeader.get('code').v;
			if(0 < this.sampleCode) {
				this.sampleCodeFound = SEGY.FindSampleFormatCode(this.sampleCode);
			}
		}

		parseTraces() {
			const isLE = this.isLE;
			const traces = this.sections.filter(s => SEGYTrace.IsMyType(s.type));
			const results = traces.map(s => SEGYTrace.ParseSectionData(this.dataView, s.offset, isLE, this.sampleCode));
			this.traces = results;

			return this.traces;
		}

		clearMemory() {
			this.dataView = undefined;

			this.sections = [];
			this.traces = [];
		}
	}


	const GetParser = (() => {
		const clsMap = new Map();
		const list = [
			SEGY,
			SEGYTrace,
		];

		list.forEach(cls => {
			cls.TYPES.forEach(type => {
				clsMap.set(type, cls);
			})
		});

		return (type) => {
			return clsMap.get(type);
		}
	})();

	// -- to create a smaller dataView
	function SliceToSection(section, dataView) {
		const result = new DataView(dataView.buffer, section.offset, section.len);
		return result;
	}


	return {
		SEGY: SEGY,
		SEGYTrace: SEGYTrace,
		GetParser: GetParser,
		SliceToSection: SliceToSection,

		// -- Parser C
		ParserContext: ParserContextBasic_SEGY,

		// -- Parser Entry
		ParserTest: ParserTest_SEGY,
	}

})();

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
			this.mapGroup = {};
		}

		addFile(file) {
			const name = file.name.match(/^(.*)\.([^.]*)$/i);
			if (name) {
				const filename = name[1];
				const fnLower = filename.toLowerCase();
				const ext = name[2];
				const lower = ext.toLowerCase();

				const found = ['hex', 'bl', 'hdr', 'xmlcon'].findIndex(rawExts => lower === rawExts);
				if (-1 !== found) {
					this.listFiles.push(file);
					if (!this.mapGroup.hasOwnProperty(fnLower)) {
						this.mapGroup[fnLower] = new CTDGroup();
					}

					this.mapGroup[fnLower].addFile(file);
				}
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
	}

	class CTDGroup {
		constructor() {
			this.files = {
				bl: undefined,
				hdr: undefined,
				hex: undefined,
				xmlcon: undefined
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
			const name = file.name.match(/^(.*)\.([^.]*)$/i);
			if (name) {
				const filename = name[1];
				const ext = name[2];
				const lower = ext.toLowerCase();

				const found = ['hex', 'bl', 'hdr', 'xmlcon'].findIndex(rawExts => lower === rawExts);
				if (-1 !== found) {
					this.files[lower] = file;

					this.name = filename;
				}
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
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					this.setDataSource(reader.result)
					resolve();
				};
				reader.readAsText(file);
			});
		}

		setDataSource(str) {
			this.dataSource = str;
			const result = CTDHDR.parseHDR(this.dataSource);
			this.parsedHDR = result;
		}

		getParsedHDR() {
			return this.parsedHDR;
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
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					this.setDataSource(reader.result)
					resolve();
				};
				reader.readAsText(file);
			});
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
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					this.setDataSource(reader.result)
					resolve();
				};
				reader.readAsText(file);
			});
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
// Requires ParserA
const ParserPD0 = (() => {
	/**
	 * Teledyne adcp raw datas like
	 * [PD0, PD0, PD0, ...];
	 * PD0 is just one 'ensemble' where it has [header, fixed, leader, velocity, ...]
	 * 
	 * separate PD0s first
	 * then split PD0 to sections
	 */

	const INVALID_VALUE = -32768;

	class PD0Header extends DataView {
		static TYPES = [0x0000];
		static IsMyType(type) {
			return -1 < PD0Header.TYPES.findIndex(d => d === type);
		}

		static STRUCT_HEADER = new Map([
			['hID', 'U2'], // header identification byte 7F7F
			['noBytesEns', 'U2'], // Bytes / Number of bytes in ensemble, hid 2 bytes not included
			['spare01', 'U1'],
			['noDataTypes', 'U1'] // Number of data types, LTA has 10
		]);

		static STRUCT_DATA_TYPES = new Map([
			['addr', 'U2'] // not used
		]);

		static ReadHeader = ParserA.CreateReader(PD0Header.STRUCT_HEADER);
		static ReadDataTypes = ParserA.CreateReader(PD0Header.STRUCT_DATA_TYPES); // not used

		static ParseSection(dataView, offset = 0, littleEndian = true) {
			const result = {};

			PD0Header.ReadHeader._toObject(dataView, offset,
				['hID', 'noBytesEns', 'noDataTypes'],
				result, littleEndian);

			const size = PD0Header.ReadHeader._size;
			const start = offset + size;

			const listOffset = [];
			for (let i = 0; i < result.noDataTypes; i++) {
				const startDataType = start + (i * 2);
				// offset for data type # (i - 1)
				const offsetDatatType = dataView.getUint16(startDataType, littleEndian);
				listOffset.push(offsetDatatType);
			}

			result.offsets = listOffset;

			return result;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();
			PD0Header.ReadHeader._toDescribeMap(dataView, offset, result, littleEndian);

			// -- variable length U2
			const noDataTypes = result.get('noDataTypes').v;

			let seq = PD0Header.ReadHeader._size;
			const dataTypes = new Map();
			for (let i = 0; i < noDataTypes; i++) {
				const idx = seq + (i * 2);
				const addr = offset + idx;
				const v = dataView.getUint16(addr, littleEndian);
				const desc = ParserA.Describe(v, 'U2', 2);
				result.set(`addr_${i}`, desc);
			}

			return result;
		}
	}

	class PD0Fixed {
		static TYPES = [0x0000];
		static IsMyType(type) {
			return -1 < PD0Fixed.TYPES.findIndex(d => d === type);
		}

		static FIXED_LEADER = new Map([
			['hID', 'U2'], // -- Should be 0
			['fwVer', 'U1'],
			['fwRev', 'U1'],
			['sysCfg', 'U2'],
			['flagSim', 'U1'], // Real / Sim flag
			['lagLen', 'U1'], // Lag length
			['noBeams', 'U1'], // Number of beams
			['noCells', 'U1'], // [WN] number of cells
			['pingsPEns', 'U2'], // [WP] Pings per ensemble 
			['dptCellLen', 'U2'], // [WS] Depth cell length
			['blankTrans', 'U2'], // [WF] Blank After transmit
			['profMode', 'U1'], // [WM] Profiling mode
			['lowCorrThresh', 'U1'], // [WC] Low corr thresh
			['noCodeReps', 'U1'], // No. Code Reps
			['PGMin', 'U1'], // [WG] %GD Minimum
			['EVMax', 'U2'], // [WE] Error Velocity Maximum
			['TPPm', 'U1'], // TPP Minutes
			['TPPs', 'U1'], // TPP Seconds
			['TPPHund', 'U1'], // [TP] TPP Hundredths
			['coordTransf', 'U1'], // [EX] Coordinate transform
			['hdtAli', 'U2'], // [EA] Heading Alignment, degree
			['hdtBias', 'U2'], // [EB] Heading Bias, degree
			['sensorSrc', 'U1'], // [EZ] Sensor Source
			['sensorsAvail', 'U1'], // Sensors Available
			['bin1Dist', 'U2'], // Bin 1 Distance
			['xmitPulseLen', 'U2'], // [WT] XMIT pulse length based on
			['WPRefAvg', 'U2'], // [WL] (starting cell) WP Ref layer average (ending cell)
			['falseTgtThresh', 'U1'], // [WA] False target thresh
			['spare02', 'U1'], // Spare
			['transLagDist', 'U2'], // Transmit lag distance
			['cpuSerial', 'U8'], // 43 ~ 50 byte
			['sysBandwidth', 'U2'], // [WB] System bandwidth
			['sysPwr', 'U1'], // [CQ] System power
			['spare03', 'U1'], // Spare
			['insSerial', 'U4'], // 55 ~ 58 byte
			['beamAngle', 'U1'], // Beam angle
		]);

		static SYSTEM = [
			[0, '75kHz'],
			[0b001, '150kHz'],
			[0b010, '300kHz'],
			[0b011, '600kHz'],
			[0b100, '1200kHz'],
			[0b101, '2400kHz'],
			[0b110, '38kHz'], // -- not on the manual but my file says its 6
		];

		static COORD = [
			[0b00000, 'No transformation'],
			[0b01000, 'Instrument coordinates'],
			[0b10000, 'Ship coordinates'],
			[0b11000, 'Earth coordinate'],
		];

		static SENSOR_SRC = [
			[0b01000000, 'Calculates EC (Speed of sound) from ED, ES, ET'],
			[0b00100000, 'Uses ED from depth sensor'],
			[0b00010000, 'Uses EH from transducer heading sensor'],
			[0b00001000, 'Uses EP from transducer pitch sensor'],
			[0b00000100, 'Uses ER from transducer roll sensor'],
			[0b00000010, 'Uses ES (Salinity) from transducer conductivity sensor'],
			[0b00000001, 'Uses ET from transducer temperature sensor'],
		];

		static ParseCoordTransform(byte) {
			const type = byte & 0b00011000;
			const tilt = byte & 0b0100;
			const beam3 = byte & 0b10;
			const binMapping = byte & 0b01;

			const typeObj = PD0Fixed.COORD.find(o => o[0] === type);
			const typeParsed = typeObj ? typeObj[1] : PD0.UNHANDLED_STR + ` value : ${type}`;
			const tiltBool = 0 < tilt;
			const tiltStr = tiltBool ? 'Tilt pitch roll used' : 'Tilt pitch roll not used';
			const beam3Bool = 0 < beam3;
			const beam3Str = beam3Bool ? '3-Beam solution used' : '3-Beam solution not used';
			const binMappingBool = 0 < binMapping;
			const binMappingStr = binMappingBool ? 'Bin mapping used' : 'Bin mapping not used';

			const r = {
				type: type,
				typeStr: typeParsed,
				tilt: tiltBool,
				tiltStr: tiltStr,
				beam3: beam3Bool,
				beam3Str: beam3Str,
				binMapping: binMappingBool,
				binMappingStr: binMappingStr
			};

			return r;
		}

		static ParseSysConfig(word) {
			const lo = (word & 0xFF);
			const hi = (word & 0xFF00) >> 8;

			// -- Low
			const system = lo & 0b00000111;
			const conBeamPat = lo & 0b1000;
			const sensorCfg = lo & 0b110000;
			const xdcr = lo & 0b1000000;
			const beamFace = lo & 0b10000000;

			const systemObj = PD0Fixed.SYSTEM.find(o => o[0] === system);
			const systemStr = systemObj ? systemObj[1] : PD0.UNHANDLED_STR + ` value : ${system.toString(2)}`;
			const conBeamPatStr = 0 < conBeamPat ? 'CONVEX BEAM PAT' : 'CONCAVE BEAM PAT';
			let sensorCfgStr = PD0.UNHANDLED_STR;

			if (0b000000 === sensorCfg) {
				sensorCfgStr = 'Sensor Config 1';
			} else if (0b010000 === sensorCfg) {
				sensorCfgStr = 'Sensor Config 2';
			} else if (0b100000 === sensorCfg) {
				sensorCfgStr = 'Sensor Config 3';
			}

			const xdcrStr = 0 < xdcr ? 'XDCR HD Attached' : 'XDCR HD Not Attached';
			const beamFaceStr = 0 < beamFace ? 'Up Facing beam' : 'Down Facing beam';

			// -- High
			const beamAngle = hi & 0b11;
			const janus = hi & 0b11110000;

			let beamAngleStr = PD0.UNHANDLED_STR + ` value : ${beamAngle.toString(2)}`;
			let janusStr = PD0.UNHANDLED_STR + ` value : ${janus.toString(2)}`;

			if (0b00 === beamAngle) {
				beamAngleStr = '15E Beam Angle';
			} else if (0b01 === beamAngle) {
				beamAngleStr = '20E Beam Angle';
			} else if (0b10 === beamAngle) {
				beamAngleStr = '30E Beam Angle';
			} else if (0b11 === beamAngle) {
				beamAngleStr = 'Other Beam Angle';
			}

			if (0b01000000 === janus) {
				janusStr = '4-Beam JANUS Config';
			} else if (0b01010000 === janus) {
				janusStr = '5-Beam JANUS Config DEMOD';
			} else if (0b11110000 === janus) {
				janusStr = '5-Beam JANUS Config 2 DEMOD'; // I dont know whats DEMOD means
			}

			const r = {
				systemStr: systemStr,
				conBeamStr: conBeamPatStr,
				sensorCfgStr: sensorCfgStr,
				xdcrStr: xdcrStr,
				beamFaceStr: beamFaceStr,
				beamAngleStr: beamAngleStr,
				janusStr: janusStr
			};

			return r;
		}

		static ParseSensorSrc(byte) {
			const sensorSrcParsed = [];
			PD0Fixed.SENSOR_SRC.forEach((item) => {
				if (0 < (item[0] & byte)) {
					sensorSrcParsed.push(item[1]);
				}
			});

			return sensorSrcParsed;
		}

		static ReadFixedLeader = ParserA.CreateReader(PD0Fixed.FIXED_LEADER);

		static ParseSysCfg(dataView, offset, littleEndian) {
			const value = PD0Fixed.ReadFixedLeader.sysCfg(dataView, offset, littleEndian);
			const parsed = PD0Fixed.ParseSysConfig(value);
			return parsed;
		}

		static ParseCoord(dataView, offset, littleEndian) {
			const coordType = PD0Fixed.ReadFixedLeader.coordTransf(dataView, offset, littleEndian);
			const coord = PD0Fixed.ParseCoordTransform(coordType);
			return coord;
		}

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			PD0Fixed.ReadFixedLeader._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}

	// -- PD0Variable should be 65bytes but example files are 60bytes, just disable rtcDate at the end
	class PD0Variable {
		static TYPES = [0x0080];
		static IsMyType(type) {
			return -1 < PD0Variable.TYPES.findIndex(d => d === type);
		}

		static VARIABLE_LEADER = new Map([
			['hID', 'U2'], // Varialbe leader id
			['noEns', 'U2'], // Ensemble number
			['tsYear', 'U1'],
			['tsMonth', 'U1'],
			['tsDay', 'U1'],
			['tsHour', 'U1'],
			['tsMin', 'U1'],
			['tsSec', 'U1'],
			['tsHundredths', 'U1'],
			['ensMSB', 'U1'], // Ensemble # MSB
			['bitResult', 'U2'], // Bit Result
			['soundSpeed', 'U2'], // [EC] Speed of sound
			['dptTrans', 'U2'], // [ED] Depth of transducer
			['hdt', 'U2'], // [EH] Heading
			['pitch', 'I2'], // [EP] Pitch
			['roll', 'I2'], // [ER] Roll
			['salinity', 'U2'], // [ES] Salinity
			['temp', 'I2'], // [ET] Temperature
			['mptMin', 'U1'], // MPT Minutes
			['mptSec', 'U1'], // MPT Seconds
			['mptHundredths', 'U1'], // MPT Hundredths
			['stdHdt', 'U1'], // heading standard deviation(accuracy)
			['stdPitch', 'U1'],
			['stdRoll', 'U1'],
			['adc0', 'U1'], // ADC Channel 0
			['adc1', 'U1'],
			['adc2', 'U1'],
			['adc3', 'U1'],
			['adc4', 'U1'],
			['adc5', 'U1'],
			['adc6', 'U1'],
			['adc7', 'U1'],
			['errStatus', 'U4'], // [CY] error status word
			['spare01', 'U2'],
			['pressure', 'U4'], // Pressure - deca-pascal
			['pressureVar', 'U4'], // Pressure sensor variance - deca-pascal
			['spare02', 'U1'],
			['rtcCentury', 'U1'], // read this as real date
			['rtcYear', 'U1'],
			// ['rtcMonth', 'U1'],
			// ['rtcDay', 'U1'],
			// ['rtcHour', 'U1'],
			// ['rtcMin', 'U1'],
			// ['rtcSec', 'U1'],
			// ['rtcHundredth', 'U1']
		]);

		static BIT_RESULT_HI = [
			[0b00010000, 'DEMOD 1 Error'],
			[0b00001000, 'DEMOD 0 Error'],
			[0b00000010, 'Timing card Error'],
		];

		// -- From low to hi
		static ERROR_STATUS1 = [
			[0b00000001, 'Bus error exception'],
			[0b00000010, 'Address error exception'],
			[0b00000100, 'Illegal Instruction exception'],
			[0b00001000, 'Zero Divide exception'],
			[0b00010000, 'Emulator exception'],
			[0b00100000, 'Unassigned exception'],
			[0b01000000, 'Watchdog restart occured'],
			[0b10000000, 'Batter saver power'],
		];

		static ERROR_STATUS2 = [
			[0b00000001, 'Pinging'],
			[0b01000000, 'Cold wakeup occurred'],
			[0b10000000, 'Unknown wakeup occurred'],
		];

		static ERROR_STATUS3 = [
			[0b00000001, 'Clock read error occurred'],
			[0b00000010, 'Unexpected alarm'],
			[0b00000100, 'Clock jump forward'],
			[0b00001000, 'Clock jump backward'],
		];

		static ERROR_STATUS4 = [
			[0b00001000, 'Power fail - unrecorded'],
			[0b00010000, 'spurious level 4 intr - DSP'],
			[0b00100000, 'spurious level 5 intr - UART'],
			[0b01000000, 'spurious level 6 intr - CLOCK'],
			[0b10000000, 'Level 7 interrupt occurred'],
		];

		static ParseBitResult(word) {
			const byte = word >> 8;
			const bitResultParsed = [];
			PD0Variable.BIT_RESULT_HI.forEach((item) => {
				if (0 < (item[0] & byte)) {
					bitResultParsed.push(item[1]);
				}
			});

			return bitResultParsed;
		}

		static ParseErrorStatus(dword) {
			const b1 = (dword & 0x000000FF);
			const b2 = (dword & 0x0000FF00) >> 8;
			const b3 = (dword & 0x00FF0000) >> 16;
			const b4 = (dword & 0xFF000000) >> 24;

			const errorStatusParsed = [];

			PD0Variable.ERROR_STATUS1.forEach((item) => {
				if (0 < (item[0] & b1)) {
					errorStatusParsed.push(item[1]);
				}
			});

			PD0Variable.ERROR_STATUS2.forEach((item) => {
				if (0 < (item[0] & b2)) {
					errorStatusParsed.push(item[1]);
				}
			});

			PD0Variable.ERROR_STATUS3.forEach((item) => {
				if (0 < (item[0] & b3)) {
					errorStatusParsed.push(item[1]);
				}
			});

			PD0Variable.ERROR_STATUS4.forEach((item) => {
				if (0 < (item[0] & b4)) {
					errorStatusParsed.push(item[1]);
				}
			});

			return errorStatusParsed;
		}

		static ParseDate(year, month, day, h, m, s, hundredS) {
			// -- OS38 only have 60bytes of variable leader, which means y2k bug still in it
			// -- I just used my method to judge 1900 or 2000
			if (year > 80) {
				year = year + 1900;
			} else {
				year = year + 2000;
			}

			month = month - 1;

			const ms = hundredS * 10;

			// return new Date(year, month, day, h, m, s, ms);
			return new Date(Date.UTC(year, month, day, h, m, s, ms));
		}

		static ReadVariableLeader = ParserA.CreateReader(PD0Variable.VARIABLE_LEADER);

		static ParseSectionDescribe(dataView, offset, littleEndian) {
			const result = new Map();

			PD0Variable.ReadVariableLeader._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}

		static ParseTimeStamp(dataView, offset, littleEndian) {
			const result = {};

			PD0Variable.ReadVariableLeader._toObject(dataView, offset,
				['tsYear', 'tsMonth', 'tsDay', 'tsHour', 'tsMin', 'tsSec', 'tsHundredths'],
				result, littleEndian);

			const date = PD0Variable.ParseDate(result.tsYear, result.tsMonth, result.tsDay, result.tsHour, result.tsMin, result.tsSec, result.tsHundredths);
			return date;
		}
	}

	class PD0Velocity {
		static TYPES = [0x0100];
		static IsMyType(type) {
			return -1 < PD0Velocity.TYPES.findIndex(d => d === type);
		}

		static SIZE_VELOCITY = 8;

		static DEPTH_CELL = new Map([
			['v1', 'I2'], // velocity #1
			['v2', 'I2'], // velocity #2
			['v3', 'I2'], // velocity #3
			['v4', 'I2'], // velocity #4
		]);

		static ParseVelocity2D(coordType, cell) {
			// -- no, raw
			if (PD0Fixed.COORD[0][0] === coordType) {
				'not Supported'; // TODO later on
				return false;
			} else if (PD0Fixed.COORD[3][0] === coordType) {
				// -- Earth coord Type
				return PD0Velocity.ParseVelocity2DEarth(cell);
			} else {
				'not Supported';
				return false;
			}
		}

		static ParseVelocity2DEarth(cell) {
			// -- Earth coord Type
			const md = PD0Velocity.XYMagDir(cell[0], cell[1]);

			return {
				magnitude: md[0],
				direction: md[1],
				e: cell[0],
				n: cell[1],
				sur: cell[2],
				err: cell[3]
			}
		}

		// -- magnitude : mm/s, direction : 0 ~ 359 degree
		/**
		 * Calculate 
		 * @param {*} e 
		 * @param {*} n 
		 * @returns 
		 */
		static XYMagDir(e, n) {
			const magnitude = Math.sqrt((e * e) + (n * n));
			const d = Math.atan2(n, e) * (180 / Math.PI); // -180 ~ 180, rotate the coordination
			const direction = (360 - d + 90) % 360

			return [magnitude, direction];
		}

		// https://www.starpath.com/freeware/truewind.pdf
		// -- TODO Verify it
		/**
		 * @param {*} ws apparent wind speed
		 * @param {*} wd apparent wind direction
		 * @param {*} bs boat speed
		 * @param {*} bh boat heading
		 * @returns [true wind speed, true wind direction]
		 */
		static TrueWind(ws, wd, bs, bh) {
			const tws1 = (bs * bs) + (ws * ws) - (2 * bs * ws * Math.cos(wd * Math.PI / 180));
			const tws = Math.sqrt(tws1);

			const beta = ((ws * ws) - (tws * tws) - (bs * bs)) / (2 * tws * bs);
			const theta = Math.acos(beta);
			const twd = bh + (theta * (180 / Math.PI));

			return [tws, twd];
		}

		/**
		 * Any degree value to 0 ~ 359, -5 -> 355
		 * @param {number} value 
		 * @returns degree
		 */
		static DegreeToRange(value) {
			value = Number(value);
			if (isNaN(value)) {
				return 0;
			}

			while (value < 0) {
				value = 360 + value;
			}

			value = value % 360;

			return value;
		}

		static ReadDepthCell = ParserA.CreateReader(PD0Velocity.DEPTH_CELL);

		static ParseSection(dataView, offset = 0, littleEndian = true) {
			const hID = dataView.getUint16(offset, littleEndian);
			const count = (dataView.byteLength - 2) / PD0Velocity.ReadDepthCell._size;

			return [hID, count];
		}

		// -- hID and cell starts, this is not a safe function!
		static ParseCell(dataView, offset = 2, littleEndian = true) {
			const cell = [
				PD0Velocity.ReadDepthCell.v1(dataView, offset, littleEndian),
				PD0Velocity.ReadDepthCell.v2(dataView, offset, littleEndian),
				PD0Velocity.ReadDepthCell.v3(dataView, offset, littleEndian),
				PD0Velocity.ReadDepthCell.v4(dataView, offset, littleEndian),
			];

			return cell;
		}

		static ParseCellAt(dataView, idx, littleEndian = true) {
			const offset = 2 + (idx * PD0Velocity.ReadDepthCell._size);
			return PD0Velocity.ParseCell(dataView, offset, littleEndian);
		}

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			const hID = dataView.getUint16(offset, littleEndian);
			result.set('hID', ParserA.Describe(hID, 'U2', 2));

			let seq = offset + 2;
			const count = (dataView.byteLength - 2) / PD0Velocity.ReadDepthCell._size;
			for (let i = 0; i < count; i++) {
				// -- Millimeters per seconds - mm/s
				const entry = new Map();
				PD0Velocity.ReadDepthCell._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + PD0Velocity.ReadDepthCell._size;

				for (const [k, v] of entry.entries()) {
					result.set(`dc${i + 1}_` + k, v);
				}
			}

			return result;
		}
	}

	class PD0Corr {
		static TYPES = [0x0200];
		static IsMyType(type) {
			return -1 < PD0Corr.TYPES.findIndex(d => d === type);
		}

		static DEPTH_CELL = new Map([
			['b1', 'U1'], // correlation magnitude data for depth cell #1, beam #1
			['b2', 'U1'], // correlation magnitude data for depth cell #1, beam #2
			['b3', 'U1'], // correlation magnitude data for depth cell #1, beam #3
			['b4', 'U1'], // correlation magnitude data for depth cell #1, beam #4
		]);

		static SIZE_CORR = 4;

		static ReadDepthCell = ParserA.CreateReader(PD0Corr.DEPTH_CELL);

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			const hID = dataView.getUint16(offset, littleEndian);
			result.set('hID', ParserA.Describe(hID, 'U2', 2));

			let seq = offset + 2;
			const count = (dataView.byteLength - 2) / PD0Corr.ReadDepthCell._size;
			for (let i = 0; i < count; i++) {
				// -- Cell Value 0 ~ 255
				// 0 : bad
				// 255 : perfect correlation - solid target
				const entry = new Map();
				PD0Corr.ReadDepthCell._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + PD0Corr.ReadDepthCell._size;

				for (const [k, v] of entry.entries()) {
					result.set(`dc${i + 1}_` + k, v);
				}
			}

			return result;
		}
	}

	class PD0Intensity {
		static TYPES = [0x0300];
		static IsMyType(type) {
			return -1 < PD0Intensity.TYPES.findIndex(d => d === type);
		}

		static DEPTH_CELL = new Map([
			['b1', 'U1'], // echo intensity data for depth cell #1, beam #1
			['b2', 'U1'], // echo intensity data for depth cell #1, beam #2
			['b3', 'U1'], // echo intensity data for depth cell #1, beam #3
			['b4', 'U1'], // echo intensity data for depth cell #1, beam #4
		]);

		static ReadDepthCell = ParserA.CreateReader(PD0Intensity.DEPTH_CELL);

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			const hID = dataView.getUint16(offset, littleEndian);
			result.set('hID', ParserA.Describe(hID, 'U2', 2));

			let seq = offset + 2;
			const count = (dataView.byteLength - 2) / PD0Intensity.ReadDepthCell._size;
			for (let i = 0; i < count; i++) {
				// -- Cell Value 0 ~ 100 percent
				const entry = new Map();
				PD0Intensity.ReadDepthCell._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + PD0Intensity.ReadDepthCell._size;

				for (const [k, v] of entry.entries()) {
					result.set(`dc${i + 1}_` + k, v);
				}
			}

			return result;
		}

	}

	class PD0PercentGood {
		static TYPES = [0x0400];
		static IsMyType(type) {
			return -1 < PD0PercentGood.TYPES.findIndex(d => d === type);
		}

		static DEPTH_CELL = new Map([
			['f1', 'U1'], // percent-good data for depth cell #1, field 1
			['f2', 'U1'], // percent-good data for depth cell #1, field 2
			['f3', 'U1'], // percent-good data for depth cell #1, field 3
			['f4', 'U1'], // percent-good data for depth cell #1, field 4
		]);

		static ReadDepthCell = ParserA.CreateReader(PD0PercentGood.DEPTH_CELL);

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			const hID = dataView.getUint16(offset, littleEndian);
			result.set('hID', ParserA.Describe(hID, 'U2', 2));

			let seq = offset + 2;
			const count = (dataView.byteLength - 2) / PD0PercentGood.ReadDepthCell._size;
			for (let i = 0; i < count; i++) {
				// -- Cell Value 0 ~ 100 percent
				const entry = new Map();
				PD0PercentGood.ReadDepthCell._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + PD0PercentGood.ReadDepthCell._size;

				for (const [k, v] of entry.entries()) {
					result.set(`dc${i + 1}_` + k, v);
				}
			}

			return result;
		}

	}

	class PD0Status {
		static TYPES = [0x0500];
		static IsMyType(type) {
			return -1 < PD0Status.TYPES.findIndex(d => d === type);
		}

		static DEPTH_CELL = new Map([
			['b1', 'U1'], // status data for depth cell #1, beam #1
			['b2', 'U1'], // status data for depth cell #1, beam #2
			['b3', 'U1'], // status data for depth cell #1, beam #3
			['b4', 'U1'], // status data for depth cell #1, beam #4
		]);

		static ReadDepthCell = ParserA.CreateReader(PD0Status.DEPTH_CELL);

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			const hID = dataView.getUint16(offset, littleEndian);
			result.set('hID', ParserA.Describe(hID, 'U2', 2));

			const seq = offset + 2;
			const count = (dataView.byteLength - 2) / PD0Status.ReadDepthCell._size;
			for (let i = 0; i < count; i++) {
				// -- Cell Value 0 ~ 1
				// 0 : Measurement was good
				// 1 : Measurement was bad
				const entry = new Map();
				PD0Status.ReadDepthCell._toDescribeMap(dataView, seq, entry, littleEndian);
				seq = seq + PD0Status.ReadDepthCell._size;

				for (const [k, v] of entry.entries()) {
					result.set(`dc${i + 1}_` + k, v);
				}
			}
		}

	}

	// -- manual is different from 2021 version to 2014 version, OS and WH is different
	class PD0BottomTrack {
		static TYPES = [0x0600];
		static IsMyType(type) {
			return -1 < PD0BottomTrack.TYPES.findIndex(d => d === type);
		}

		static BT_DATA = new Map([
			['hID', 'U2'], // 0x0600
			['pingsPEns', 'U2'], // [BP] BT Pings per ensemble
			['delayReacq', 'U2'], // [BD] BT Delay before re-acquire
			['corrMagMin', 'U1'], // [BC] BT Corr mag min
			['evalAmpMin', 'U1'], // [BA] BT Eval amp min
			['pgMin', 'U1'], // [BG] BT Percent good min
			['mode', 'U1'], // [BM] BT Mode
			['errVelMax', 'U2'], // [BE] BT Err Vel. Max
			['reserved', 'U4'], // Reserved 4 bytes
			['range1', 'U2'], // BT Range / Beam #1
			['range2', 'U2'], // BT Range / Beam #2
			['range3', 'U2'], // BT Range / Beam #3
			['range4', 'U2'], // BT Range / Beam #4
			['vel1', 'U2'], // BT Velocity / Beam #1-4 BT Vel
			['vel2', 'U2'], // BT Velocity / Beam #1-4 BT Vel
			['vel3', 'U2'], // BT Velocity / Beam #1-4 BT Vel
			['vel4', 'U2'], // BT Velocity / Beam #1-4 BT Vel
			['corr1', 'U1'], // BTCM / Beam #1-4 BT Corr.
			['corr2', 'U1'], // BTCM / Beam #1-4 BT Corr.
			['corr3', 'U1'], // BTCM / Beam #1-4 BT Corr.
			['corr4', 'U1'], // BTCM / Beam #1-4 BT Corr.
			['evalAmp1', 'U1'], // BTEA / Beam #1-4 BT Eval Amp
			['evalAmp2', 'U1'], // BTEA / Beam #1-4 BT Eval Amp
			['evalAmp3', 'U1'], // BTEA / Beam #1-4 BT Eval Amp
			['evalAmp4', 'U1'], // BTEA / Beam #1-4 BT Eval Amp
			['pg1', 'U1'], // BTPG / Beam #1-4 BT %Good
			['pg2', 'U1'], // BTPG / Beam #1-4 BT %Good
			['pg3', 'U1'], // BTPG / Beam #1-4 BT %Good
			['pg4', 'U1'], // BTPG / Beam #1-4 BT %Good
			['rl1', 'U2'], // Ref Layer (Min, near, Far)
			['rl2', 'U2'], // Ref Layer (Min, near, Far)
			['rl3', 'U2'], // Ref Layer (Min, near, Far)
			['rlVel1', 'U2'], // Ref Vel / Beam #1-4 Ref Layer Vel
			['rlVel2', 'U2'], // Ref Vel / Beam #1-4 Ref Layer Vel
			['rlVel3', 'U2'], // Ref Vel / Beam #1-4 Ref Layer Vel
			['rlVel4', 'U2'], // Ref Vel / Beam #1-4 Ref Layer Vel
			['rlcm1', 'U1'], // RLCM / Bm #1-4 Ref Corr
			['rlcm2', 'U1'], // RLCM / Bm #1-4 Ref Corr
			['rlcm3', 'U1'], // RLCM / Bm #1-4 Ref Corr
			['rlcm4', 'U1'], // RLCM / Bm #1-4 Ref Corr
			['rlei1', 'U1'], // RLEI / Bm #1-4 Ref Int
			['rlei2', 'U1'], // RLEI / Bm #1-4 Ref Int
			['rlei3', 'U1'], // RLEI / Bm #1-4 Ref Int
			['rlei4', 'U1'], // RLEI / Bm #1-4 Ref Int
			['rlpg1', 'U1'], // RLPG / Bm #1-4 Ref %Good
			['rlpg2', 'U1'], // RLPG / Bm #1-4 Ref %Good
			['rlpg3', 'U1'], // RLPG / Bm #1-4 Ref %Good
			['rlpg4', 'U1'], // RLPG / Bm #1-4 Ref %Good
			['maxDepth', 'U2'], // BX / BT Max Depth
			['rssiAmp1', 'U1'], // RSSI / Bm #1-4 RSSI Amp
			['rssiAmp2', 'U1'], // RSSI / Bm #1-4 RSSI Amp
			['rssiAmp3', 'U1'], // RSSI / Bm #1-4 RSSI Amp
			['rssiAmp4', 'U1'], // RSSI / Bm #1-4 RSSI Amp
			['gain', 'U1'], // GAIN
			['rangeMSB1', 'U1'], // BT Range MSB / Bm #1-4
			['rangeMSB2', 'U1'], // BT Range MSB / Bm #1-4
			['rangeMSB3', 'U1'], // BT Range MSB / Bm #1-4
			['rangeMSB4', 'U1'], // BT Range MSB / Bm #1-4
			// ['reserved2', 'U4'], 
		]);

		// order
		// RANGE(2), VEL(2), CORR, EVAL AMP, PG, REF Layer(2) * 3, REF LAYER VEL(2)
		// REF CORR, REF INT, REF PG, BT MAX DEPTH, RSSI AMP, GAIN

		// -- Ref layer min / near far
		static BT_LAYER_WORD = new Map([
			['min', 'U2'],
			['near', 'U2'],
			['far', 'U2'],
		]);

		static ReadBottomTrack = ParserA.CreateReader(PD0BottomTrack.BT_DATA);

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			// -- workhorse manual says theres reserved at the end but my file don't
			PD0BottomTrack.ReadBottomTrack._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}

	class PD0AmbientSoundProfile {
		// parseDetail() {
		// 	const hID = this.getUint16(0);
		// 	this.addParseOffset(2);
		// 	const rssi = this.parseArray('U1', 4);

		// 	if (TDPD0.HID.ASP.code !== hID) {
		// 		console.error(`Invalid HID for Ambient Sound Profile(${TDPD0.HID.PG.code.toString(16)}) != ${hID.toString(16)}`);
		// 		return;
		// 	}

		// 	const r = {
		// 		hID: hID,
		// 		rssi: rssi
		// 	};

		// 	this.saveDetail(r);
		// }
	}

	class PD0Navigation {
		static NAV_DATA = new Map([
			['hID', 'U2'], // 0x2000
			['utcDay', 'U1'], // UTC Day
			['utcMonth', 'U1'], // UTC Month
			['utcYear', 'U2'], // UTC Year 07CF = 1999
			['utcTimeFF', 'I4'], // UTC Time of first fix
			['pcClockOffset', 'I4'], // PC Clock offset from UTC
			['firstLat', 'U4'], // First Latitude
			['firstLng', 'U4'], // First Longitude
			['utcTimeLF', 'U4'], // UTC Time of last fix
			['lastLat', 'U4'], // Last Latitude
			['lastLng', 'U4'], // Last Longitude
			['avgSpd', 'I2'], // Average Speed mm/sec signed
			['avgTrackTrue', 'U2'], // Average Track True
			['avgTrackMag', 'U2'], // Average Track magnetic
			['SMG', 'U2'], // Speed Made good mm/sec signed
			['DMG', 'U2'], // Direction Made good
			['reserved1', 'U2'], // Reserved
			['flags', 'U2'], // Flags
			['reserved2', 'U2'], // Reserved
			['noEns', 'U4'], // ADCP Ensemble number - TODO different from Variable leader noEns
			['ensYear', 'U2'], // ADCP Ensemble Year
			['ensDay', 'U1'], // ADCP Ensemble Day
			['ensMonth', 'U1'], // ADCP Ensemble Month
			['ensTime', 'U4'], // ADCP Ensemble Time
			['pitch', 'I2'], // Pitch
			['roll', 'I2'], // Roll
			['hdt', 'U2'], // Heading
			['numSpeedAvg', 'U2'], // Number of speed avg
			['numTTAvg', 'U2'], // Number of True track avg
			['numMTAvg', 'U2'], // Number of Mag track avg
			['numHdtAvg', 'U2'], // Number of Heading avg
			['numPRAvg', 'U2'], // Number of Pitch / Roll avg
		]);

		static BAM(value, bit) {
			return value * 180 / Math.pow(2, bit - 1);
		}

		static parseNavFlags(word) {
			const strInvalid = [], strValid = [];
			0 === (word & 0b00000000001) && strInvalid.push('Data not updated');
			0 === (word & 0b00000000010) && strInvalid.push('PSN Invalid');
			0 === (word & 0b00000000100) && strInvalid.push('Speed Invalid');
			0 === (word & 0b00000001000) && strInvalid.push('Mag Track Invalid');
			0 === (word & 0b00000010000) && strInvalid.push('True Track Invalid');
			0 === (word & 0b00000100000) && strInvalid.push('Date/Time Invalid');
			0 === (word & 0b00001000000) && strInvalid.push('SMG/DMG Invalid');
			0 === (word & 0b00010000000) && strInvalid.push('Pitch/Roll Invalid');
			0 === (word & 0b00100000000) && strInvalid.push('Heading Invalid');
			0 === (word & 0b01000000000) && strInvalid.push('ADCP Time Invalid');
			0 === (word & 0b10000000000) && strInvalid.push('Clock offset Time Invalid');

			0 !== (word & 0b00000000001) && strValid.push('Data updated');
			0 !== (word & 0b00000000010) && strValid.push('PSN Valid');
			0 !== (word & 0b00000000100) && strValid.push('Speed Valid');
			0 !== (word & 0b00000001000) && strValid.push('Mag Track Valid');
			0 !== (word & 0b00000010000) && strValid.push('True Track Valid');
			0 !== (word & 0b00000100000) && strValid.push('Date/Time Valid');
			0 !== (word & 0b00001000000) && strValid.push('SMG/DMG Valid');
			0 !== (word & 0b00010000000) && strValid.push('Pitch/Roll Valid');
			0 !== (word & 0b00100000000) && strValid.push('Heading Valid');
			0 !== (word & 0b01000000000) && strValid.push('ADCP Time Valid');
			0 !== (word & 0b10000000000) && strValid.push('Clock offset Time Valid');

			return { invalid: strInvalid, valid: strValid };
		}

		static ReadNavigation = ParserA.CreateReader(PD0Navigation.NAV_DATA);

		static ParseSMGDMG(dataView, offset = 0, littleEndian = true) {
			const smg = PD0Navigation.ReadNavigation.SMG(dataView, offset, littleEndian);
			const dmg = PD0Navigation.ReadNavigation.DMG(dataView, offset, littleEndian);

			return [smg, dmg];
		}

		static ParsePositionFirst(dataView, offset = 0, littleEndian = true) {
			const firstLat = PD0Navigation.ReadNavigation.firstLat(dataView, offset, littleEndian);
			const firstLng = PD0Navigation.ReadNavigation.firstLng(dataView, offset, littleEndian);

			return [firstLat, firstLng];
			// const firstPos = [PD0Navigation.BAM(firstLat, 32), PD0Navigation.BAM(firstLng, 32)];
		}

		static ParsePositionLast(dataView, offset = 0, littleEndian = true) {
			const lastLat = PD0Navigation.ReadNavigation.lastLat(dataView, offset, littleEndian);
			const lastLng = PD0Navigation.ReadNavigation.lastLng(dataView, offset, littleEndian);

			return [lastLat, lastLng];
		}

		static ParseSectionDescribe(dataView, offset = 0, littleEndian = true) {
			const result = new Map();

			PD0Navigation.ReadNavigation._toDescribeMap(dataView, offset, result, littleEndian);

			return result;
		}
	}

	class PD0BinFixedAttitude {
		static BINFIXED_ATTITUDE_DATA = new Map([
			['EF', 'U1'], // [EF] External Pitch roll scaling
			['EH', 'U2'], // [EH] Fixed heading scaling
			['EI', 'U2'], // [EI] Roll misalignment
			['EJ', 'U2'], // [EJ] Pitch misalignment
			['EP', 'U4'], // [EP] Pitch Roll coordinate frame
			['EU', 'U1'], // [EU] Orientation
			['EV', 'U2'], // [EV] Heading offset
			['EZ', 'U8'], // [EZ] Sensor source
		]);

		// parseDetail() {
		// 	const hID = this.getUint16(0);
		// 	this.addParseOffset(2);

		// 	if (TDPD0.HID.BINFIXED_ATTITUDE.code !== hID) {
		// 		console.error(`Invalid HID for Binary Fixed Attitude(${TDPD0.HID.BINFIXED_ATTITUDE.code.toString(16)}) != ${hID.toString(16)}`);
		// 		return;
		// 	}

		// 	const strEE = this.toAsciiString(2, 9);
		// 	this.addParseOffset(8);

		// 	const r = this.parse(PD0BinFixedAttitude.BINFIXED_ATTITUDE_DATA);
		// 	r.hID = hID;
		// 	r.EE = strEE;

		// 	this.saveDetail(r);
		// }

	}

	class PD0BinVariableAttitude {
		// parseDetail() {
		// 	const hID = this.getUint16(0);
		// 	this.addParseOffset(2);

		// 	// 3040 ~ 30FC
		// 	// if(TDPD0.HID.ATTITUDE.code !== hID) {
		// 	// 	console.error(`Invalid HID for Binary Attitude(${TDPD0.HID.ATTITUDE.code.toString(16)}) != ${hID.toString(16)}`);
		// 	// 	return;
		// 	// }

		// 	const listTypes = [];
		// 	for (let i = 1; i <= 8; i++) {
		// 		const group = this.parseArray('U2', 3 * 2);
		// 		listTypes.push(group);
		// 	}

		// 	const detail = {
		// 		hID: hID,
		// 		types: listTypes
		// 	};

		// 	this.saveDetail(detail);
		// }
	}

	class PD0 {
		static HEADER_HID = 0x7F7F;

		static HID = {
			'HEADER': { code: PD0.HEADER_HID, title: 'Header', cls: PD0Header },
			'FIXED': { code: 0x0000, title: 'Fixed Leader', cls: PD0Fixed },
			'VARIABLE': { code: 0x0080, title: 'Variable Leader', cls: PD0Variable },
			'VELOCITY': { code: 0x0100, title: 'Veolocity Data', cls: PD0Velocity },
			'CORR': { code: 0x0200, title: 'Correlation magnitude Data', cls: PD0Corr },
			'INTENSITY': { code: 0x0300, title: 'Echo intensity Data', cls: PD0Intensity },
			'PG': { code: 0x0400, title: 'Percent good Data', cls: PD0PercentGood },
			'STATUS': { code: 0x0500, title: 'Status Data', cls: PD0Status },
			'BT': { code: 0x0600, title: 'Bottom Track Data', cls: PD0BottomTrack },
			'ASP': { code: 0x020C, title: 'Ambient Sound Profile', cls: PD0AmbientSoundProfile },
			'MICROCAT': { code: 0x0800, title: 'MicroCAT Data' },
			'NAV': { code: 0x2000, title: 'Binary Navigation Data', cls: PD0Navigation },
			'BINFIXED_ATTITUDE': { code: 0x3000, title: 'Binary Fixed Attitude Data', cls: PD0BinFixedAttitude },
			'BINVAR_ATTITUDE': { code: 0x3040, title: 'Binary Variable Attitude data', cls: PD0BinVariableAttitude },
			// -- 3040 ~ 30FC Binary Variable Attitude data format
			'UNKNOWN30E8': { code: 0x30e8, title: 'Unknown type 0x30E8' },
			'UNKNOWN30D8': { code: 0x30d8, title: 'Unknown type 0x03D8' }, // found HI-18-12 OS38
		}

		static SplitEnsemble(dataView, offset, littleEndian = true) {
			const hid = dataView.getUint16(offset, littleEndian);
			if (PD0.HEADER_HID !== hid) {
				return false;
			}

			const header = PD0Header.ParseSection(dataView, offset, littleEndian);

			return header;
		}

		static DescType(uint16) {
			for (const [k, v] of Object.entries(PD0.HID)) {
				if (v.code === uint16) {
					return v;
				}
			}
		}

		static GetTitle(uint16) {
			for (const [k, v] of Object.entries(PD0.HID)) {
				if (v.code === uint16) {
					return v.title;
				}
			}
		}

		static GetParser(uint16) {
			for (const [k, v] of Object.entries(PD0.HID)) {
				if (v.code === uint16) {
					return v.cls?.ParseSectionDescribe;
				}
			}
		}

	}

	class EnsembleContext {

		constructor(littleEndian = true) {
			this.littleEndian = littleEndian;
		}

		/*
		ensemble -
		hID : 32639
		noBytesEns : 2413
		noDataTypes : 10
		offsets : Array(10)
		[26, 86, 146, 948, 1350, 1752, 2154, 2235, 2269, 2319]
		len : 2415
		offset : 483000
		title : "Ensemble"
		*/
		// dataView starts with 7F7F and parse only one ensemble
		parse(dataView, ensemble = undefined) {
			this.dataView = dataView;

			if (undefined === ensemble) {
				ensemble = PD0.SplitEnsemble(dataView, 0, this.littleEndian);
			}

			this.offsets = ensemble.ensemble.offsets;
			this.sections = EnsembleContext.DivideOffsets(this.offsets, ensemble.len, 0);

			this.sections.forEach(s => {
				const hID = dataView.getUint16(s.offset, this.littleEndian);
				s.hID = hID;
				s.dataView = new DataView(dataView.buffer, ensemble.offset + s.offset, s.len);
			});

			const map = new Map();
			for (const [k, v] of Object.entries(PD0.HID)) {
				const foundSection = this.sections.find(s => s.hID === v.code);
				if (foundSection) {
					map.set(k, foundSection);
				}
			}

			this.sectionMap = map;

			this.parseEssential();
		}

		parseEssential() {
			const dvFixed = this.fixed?.dataView;
			const dvNav = this.nav?.dataView;
			if (!dvFixed || !dvNav) {
				return undefined;
			}

			const sysCfg = PD0Fixed.ParseSysCfg(dvFixed, 0, this.littleEndian);
			this.sysCfg = sysCfg;

			const coord = PD0Fixed.ParseCoord(dvFixed, 0, this.littleEndian);
			this.coord = coord; // coordination type of this context
			// this.coord.type

			const smgdmg = PD0Navigation.ParseSMGDMG(dvNav, 0, this.littleEndian);
			this.smg = smgdmg[0];
			this.dmg = PD0Navigation.BAM(smgdmg[1], 16);
		}

		get header() {
			return this.sectionMap?.get('HEADER');
		}

		get fixed() {
			return this.sectionMap?.get('FIXED');
		}

		get variable() {
			return this.sectionMap?.get('VARIABLE');
		}

		get velocity() {
			return this.sectionMap?.get('VELOCITY');
		}

		get corr() {
			return this.sectionMap?.get('CORR');
		}

		get intensity() {
			return this.sectionMap?.get('INTENSITY');
		}

		get pg() {
			return this.sectionMap?.get('PG');
		}

		get status() {
			return this.sectionMap?.get('STATUS');
		}

		get nav() {
			return this.sectionMap?.get('NAV');
		}

		// -- velocityCells, velocityMD
		parseVelocity2D(count = -1, acc = 1) {
			if (PD0Fixed.COORD[3][0] !== this.coord.type) {
				console.error(`EnsembleContext.parseVelocity2D only supports Earth coordination type`);
				console.log(this.coord);
				return undefined;
			}

			const dvVelocity = this.velocity?.dataView;
			if (!dvVelocity) {
				console.error(`EnsembleContext.parseVelocity2D has no velocity section`);
				return undefined;
			}

			const header = PD0Velocity.ParseSection(dvVelocity, 0, this.littleEndian);

			const cellCount = header[1];

			if (isNaN(cellCount) || 0 > cellCount || 500 < cellCount || cellCount !== parseInt(cellCount)) {
				console.error(`EnsembleContext.parseVelocity2D invalid cellCount ${cellCount}`);
				return undefined;
			}

			let parseCount = count;
			if (parseCount < 0 || parseCount > cellCount || isNaN(parseCount)) {
				parseCount = cellCount;
			}

			const cells = [], mds = [];
			for (let i = 0; i < parseCount; i = i + acc) {
				const cell = PD0Velocity.ParseCellAt(dvVelocity, i, this.littleEndian);
				const md = PD0Velocity.ParseVelocity2DEarth(cell);

				if (INVALID_VALUE === md.n || INVALID_VALUE === md.e) {
					md.magnitude = INVALID_VALUE;
					md.direction = INVALID_VALUE;
				}

				cells.push(cell);
				mds.push(md);
			}

			this.velocityCells = cells;
			this.velocityMD = mds;

			return true;
		}

		parseMDNav() {
			const shipSpd = this.smg;
			const shipHdt = this.dmg;

			const mdNav = [];
			this.velocityMD.forEach((item) => {
				// -- Invalid value
				if (INVALID_VALUE === item.magnitude || INVALID_VALUE === item.direction) {
					mdNav.push([INVALID_VALUE, INVALID_VALUE]);
					return;
				}

				// -- Zero Speed -> just same as MD
				if (0 === shipSpd) {
					mdNav.push(item);
					return;
				}

				// -- Calculate
				const apparentDirection = PD0Velocity.DegreeToRange(item.direction + 180 - shipHdt);
				const md = PD0Velocity.TrueWind(item.magnitude, apparentDirection, shipSpd, shipHdt);
				md[1] = (md[1] + 180) % 360;
				mdNav.push(md);
			});

			this.velocityMDNav = mdNav;
		}

		parsePosition() {
			const dvNav = this.nav?.dataView;

			if (!dvNav) {
				console.error(`EnsembleContext.parsePosition has no navigation section`);
				return false;
			}

			let posFirst = PD0Navigation.ParsePositionFirst(dvNav, 0, this.littleEndian);
			let posLast = PD0Navigation.ParsePositionLast(dvNav, 0, this.littleEndian);

			posFirst = [PD0Navigation.BAM(posFirst[0], 32), PD0Navigation.BAM(posFirst[1], 32)];
			posLast = [PD0Navigation.BAM(posLast[0], 32), PD0Navigation.BAM(posLast[1], 32)];

			this.posFirst = posFirst;
			this.posLast = posLast;

			return true;
		}

		parseTimeStamp() {
			const dvVar = this.variable?.dataView;

			if (!dvVar) {
				console.error(`EnsembleContext.parseTimeStamp has no variable section`);
				return false;
			}

			const ts = PD0Variable.ParseTimeStamp(dvVar, 0, this.littleEndian);
			this.ts = ts;
		}

		parseMeta() {
			if (!this.posFirst) {
				this.parsePosition();
			}

			if (!this.ts) {
				this.parseTimeStamp();
			}

			this.meta = {
				eq: "ADCP_" + this.sysCfg.systemStr,
				eqid: "ADCP_" + this.sysCfg.systemStr + "_0000",
				ts: this.ts,
				ms: this.ts.getTime(),
				lat: this.posFirst[0],
				lng: this.posFirst[1],
				lat2: this.posLast[0],
				lng2: this.posLast[1]
			};

			return this.meta;
		}

		getMeta() {
			return this.meta;
		}

		static GetMetaDesc() {
			return {
				ts: 'Variable tsYear, tsMonth, tsDay, tsHour, tsMin, tsSec, tsHundredths - parseTimestamp',
				ts2: 'no ts2 since ensemble has one varialbe',
				ms: 'ts.getTime()',
				eq: 'ADCP_ + sysCfg.systemStr - ADCP_38kHz',
				eqid: 'no serial in file, eq +_0000, just use any name',
				lat: 'Navigation positionFirst[0] from parsePosition',
				lng: 'Navigation positionFirst[1] from parsePosition',
				lat2: 'Navigation positionLast[0] from parsePosition',
				lng2: 'Navigation positionLast[1] from parsePosition',
			}
		}

		// DivideOffsets([0, 30, 241, 500], 600, 0, true)
		static DivideOffsets(offsets, totalBytes, baseOffset = 0, include0 = true) {
			const result = [];

			if (!totalBytes) {
				console.error('EnsembleContext.OffsetDivide should have totalBytes');
				return undefined;
			}

			const cloned = offsets.map(d => d);
			if (true === include0 && 0 !== cloned[0]) {
				cloned.unshift(0);
			}

			cloned.push(totalBytes)

			for (let i = 0; i < cloned.length - 1; i++) {
				const o1 = cloned[i];
				const o2 = cloned[i + 1];
				const len = o2 - o1;
				result.push({
					offset: baseOffset + o1,
					len: len,
				});
			}

			return result;
		}
	}

	// file with ensembles
	class PD0Context {

		constructor() {
			this.dataView = undefined;
			this.ensembles = undefined;
			this.littleEndian = true;
		}

		load(dataView, ensembles, littleEndian) {
			this.dataView = dataView;
			this.ensembles = ensembles;
			this.littleEndian = littleEndian;
		}
	}

	class ParserEntryPD0 {
		static ParseEnsembles(ab, littleEndian = true) {
			const dataView = new DataView(ab);

			const listEnsemble = [];
			let offset = 0;
			while (offset < dataView.byteLength) {
				const ensemble = PD0.SplitEnsemble(dataView, offset, littleEndian);
				if (!ensemble) {
					break;
				}

				const ensSection = {
					offset: offset,
					len: ensemble.noBytesEns + 2,
					title: 'Ensemble',
					ensemble: ensemble
				}

				listEnsemble.push(ensSection);
				offset = offset + ensemble.noBytesEns + 2 // 2 is 7F7F
			}

			const context = new PD0Context();
			context.load(dataView, listEnsemble, littleEndian);

			return context;
		}

		// -- whole ensembles in pod0context
		static ParseEnsemblesContext(pd0context) {
			pd0context.ensembles.forEach(ens => {
				ParserEntryPD0.ParseEnsembleContext(pd0context, ens);
			});
		}

		// -- just one ensemble
		static ParseEnsembleContext(pd0context, ensemble) {
			const obj = new EnsembleContext();
			const dataView = new DataView(
				pd0context.dataView.buffer,
				ensemble.offset,
				ensemble.len
			);
			obj.parse(dataView, ensemble);
			ensemble.context = obj;
		}

		static ParseMeta(ab, littleEndian = true) {
			const context = ParserEntryPD0.ParseEnsembles(ab, littleEndian)
			const ens = [context.ensembles.at(0), context.ensembles.at(-1)];
			const metas = ens.map((e) => {
				ParserEntryPD0.ParseEnsembleContext(context, e);
				e.context.parseMeta();
				return e.context.getMeta();
			});

			const meta = {
				eq: metas[0].eq,
				eqid: metas[0].eqid,
				lat: metas[0].lat,
				lng: metas[0].lng,
				lat2: metas[1].lat2,
				lng2: metas[1].lng2,
				ts: metas[0].ts,
				ms: metas[0].ms,
				ts2: metas[1].ts,
				ms2: metas[1].ms,
				count: context.ensembles.length
			}

			return meta;
		}

		static GetMetaDesc() {
			return {
				ts: 'Variable tsYear, tsMonth, tsDay, tsHour, tsMin, tsSec, tsHundredths - parseTimestamp',
				ts2: 'no ts2 since ensemble has one varialbe',
				ms: 'ts.getTime()',
				eq: 'ADCP_ + sysCfg.systemStr - ADCP_38kHz',
				eqid: 'no serial in file, eq +_0000, just use any name',
				lat: 'Navigation positionFirst[0] from parsePosition',
				lng: 'Navigation positionFirst[1] from parsePosition',
				lat2: 'Navigation positionLast[0] from parsePosition',
				lng2: 'Navigation positionLast[1] from parsePosition',
				count: 'number of ensembles',
				desc: 'parse meta from arrayBuffer, first and last ensemble only, ensemble context parsed with ParserEntryPD0'
			}
		}
	}

	return {
		// -- Parser A
		PD0: PD0,
		PD0Header: PD0Header,
		PD0Fixed: PD0Fixed,
		PD0Variable: PD0Variable,
		PD0Navigation: PD0Navigation,
		PD0Velocity: PD0Velocity,

		// -- Parser B

		// -- Parser C
		ParserContext: PD0Context,
		Ensemble: EnsembleContext,

		// -- Parser Entry
		ParserTest: ParserEntryPD0,

		// -- Direct access
		GetTitle: PD0.GetTitle,
		GetParser: PD0.GetParser,
		DescType: PD0.DescType,
		ParseEnsembles: ParserEntryPD0.ParseEnsembles,
		ParseMeta: ParserEntryPD0.ParseMeta,
		GetMetaDesc: ParserEntryPD0.GetMetaDesc,

		INVALID_VALUE: INVALID_VALUE,
	}
})();


	return {
		ParserA: ParserA,
		ParserEM: ParserEM,
		ParserSEGY: ParserSEGY,
		ParserCTD: ParserCTD,
		ParserPD0: ParserPD0
	}
})();
