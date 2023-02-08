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
