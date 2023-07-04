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
				count: context.ensembles.length,
				bytes: ab.byteLength
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
				desc: 'parse meta from arrayBuffer, first and last ensemble only, ensemble context parsed with ParserEntryPD0',
				bytes: 'arrayBuffer.byteLength'
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
