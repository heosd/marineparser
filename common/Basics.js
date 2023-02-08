function filterOutliers(someArray) {
	// Copy the values, rather than operating on references to existing values
	var values = someArray.concat();

	// Then sort
	values.sort(function (a, b) {
		return a - b;
	});

	/* Then find a generous IQR. This is generous because if (values.length / 4)
	 * is not an int, then really you should average the two elements on either
	 * side to find q1.
	 */
	var q1 = values[Math.floor(values.length / 4)];
	// Likewise for q3.
	var q3 = values[Math.ceil(values.length * (3 / 4))];
	var iqr = q3 - q1;

	// Then find min and max values
	var maxValue = q3 + iqr * 1.5;
	var minValue = q1 - iqr * 1.5;

	// Then filter anything beyond or beneath these values.
	// var filteredValues = values.filter(function (x) {
	// 	return x <= maxValue && x >= minValue;
	// });

	return {
		validRange: [minValue, maxValue],
		extent: [values[0], values.at(-1)],
		// data: filteredValues,
	};
}

const scaleLinear = function (domain, range) {
	return (v) => {
		return range[0] + (range[1] - range[0]) * ((v - domain[0]) / (domain[1] - domain[0]));
	}
};

const scaleLinearLimit = function (domain, range) {
	const extentRange = [Math.min(...range), Math.max(...range)];
	return (v) => {
		let r = range[0] + (range[1] - range[0]) * ((v - domain[0]) / (domain[1] - domain[0]));
		r = r < extentRange[0] ? extentRange[0] : (r > extentRange[1] ? extentRange[1] : r);
		return r;
	}
};

// color = createColorScheme([3500, 3700], [0xRED, 0xBLUE, 0xCYAN...], 0xFF000000);
// color(3600)
function createColorSceheme(range, listScheme, invalidColor) {
	const DEFAULT_INVALID_COLOR = 0xFF000000;

	let errorColor = DEFAULT_INVALID_COLOR;
	if (undefined !== invalidColor) {
		errorColor = invalidColor;
	}

	const _scaleColor = scaleLinear(range, [0, listScheme.length - 1]);

	return (depth) => {
		const idx = Math.floor(_scaleColor(depth));
		if (0 > idx || idx >= listScheme.length) {
			return errorColor;
		}

		return listScheme[idx];
	}
}

function ARGBtoABGR(argb) {
	const b = argb & 0xFF;
	const r = argb & 0xFF0000;
	return (argb & 0xFF00FF00) | (b << 16) | (r >> 16);
}

// -- simple statistics
function ssMean(arr, name) {
	if (name) {
		return arr.reduce((a, b) => a + b[name], 0) / arr.length;
	} else {
		return arr.reduce((a, b) => a + b, 0) / arr.length;
	}
}

function ssStd(arr, name) {
	const mean = ssMean(arr, name);
	if (name) {
		return Math.sqrt(arr.reduce((a, b) => a + Math.pow((b[name] - mean), 2), 0) / arr.length);
	} else {
		return Math.sqrt(arr.reduce((a, b) => a + Math.pow((b - mean), 2), 0) / arr.length);
	}
}

function ssExtent(arr, name) {
	let min = Number.MAX_VALUE, max = Number.MIN_VALUE;

	if (!name) {
		arr.forEach(d => {
			d < min && (min = d);
			d > max && (max = d);
		});
	} else if(name && 'function' === typeof name) {
		arr.forEach(d => {
			const v = name(d);
			v < min && (min = v);
			v > max && (max = v);
		});
	} else if(name && 'string' === typeof name) {
		arr.forEach(d => {
			const v = d[name];
			v < min && (min = v);
			v > max && (max = v);
		});
	}

	return [min, max];
}

function ssBasic(arr, name) {
	const mean = ssMean(arr, name);
	let min = Number.MAX_VALUE, max = Number.MIN_VALUE;
	let sum = 0;

	if(name) {
		arr.forEach(d => {
			const v = d[name];
			sum = sum + Math.pow(v - mean, 2);

			v < min && (min = v);
			v > max && (max = v);
		});
	} else {
		arr.forEach(d => {
			const v = d;
			sum = sum + Math.pow(v - mean, 2);

			v < min && (min = v);
			v > max && (max = v);
		});
	}

	const std = Math.sqrt(sum / arr.length);

	return {
		mean: mean,
		std: std,
		extent: [min, max]
	}
}

