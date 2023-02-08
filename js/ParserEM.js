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