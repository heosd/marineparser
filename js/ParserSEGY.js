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

		static ParseMeta(ab) {
			const context = new ParserContextBasic_SEGY();
			context.load(ab);
			context.parseMeta();
			return context.getMeta();
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

		parseMeta() {
			const meta = {};

			const sectionTraces = this.sections.filter(d => SEGYTrace.IsMyType(d.type));
			const traces = [sectionTraces[0], sectionTraces.at(-1)];

			const results = traces.map(s => SEGYTrace.ParseSection(this.dataView, s.offset, this.isLE, this.sampleCode));
			meta.ts = results[0][3];
			meta.ms = meta.ts.getTime();
			meta.lat = results[0][5];
			meta.lng = results[0][6];
			meta.ts2 = results[1][3];
			meta.ms2 = meta.ts2.getTime();
			meta.lat2 = results[1][5];
			meta.lng2 = results[1][6];
			meta.desc = `interval : ${results[0][2]}, number samples : ${results[0][1]}`;
			meta.count = sectionTraces.length;
			meta.bytes = this.dataView.byteLength;

			this.meta = meta;

			return this.meta;
		}

		getMeta() {
			return this.meta;
		}

		static GetMetaDesc() {
			return {
				ts: 'trace[0].ts',
				ms: 'trace[0].ts.getTime()',
				lat: 'trace[0].lat',
				lng: 'trace[0].lng',
				ts2: 'trace[-1].ts',
				ms2: 'trace[-1].ts.getTime()',
				lat2: 'trace[-1].lat',
				lng2: 'trace[-1].lng',
				desc: 'trace[0].interval, trace[0].numSample',
				count: 'trace.length',
				bytes: 'arrayBuffer.byteLength'
			}
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
		ParseMeta: ParserTest_SEGY.ParseMeta
	}

})();
