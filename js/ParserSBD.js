const ParserSBD = (() => {
    // Parser for Argo SBD files
    // 100 fixed bytes as 'packet'

    class ArgoSBD0 {
        static STRUCT_TECHNICAL_N1 = new Map([
            ["type", "U1"],
            ["gi_cycleno", "U2"],
            ["gi_irisesno", "U1"],
            ["gi_ffchk", "U2"],
            ["gi_fserialno", "U2"],
            ["er_day", "U1"],
            ["er_month", "U1"],
            ["er_year", "U1"],
            ["er_rday", "U1"],
            ["er_cyclestart", "U2"],
            ["er_hyd1surf", "U2"],
            ["er_nosimplevalvesurf", "U1"],
            ["er_groundsurf", "U1"],
            ["pdd_descstart", "U2"],
            ["pdd_fstabletime", "U2"],
            ["pdd_descend", "U2"],
            ["pdd_novalve", "U1"],
            ["pdd_nopump", "U1"],
            ["pdd_fstablepres", "U2"],
            ["pdd_maxpres", "U2"],
            ["pdp_driftabsday", "U1"],
            ["pdp_noent", "U1"],
            ["pdp_norepos", "U1"],
            ["pdp_minpres", "U2"],
            ["pdp_maxpres", "U2"],
            ["pdp_novalve", "U1"],
            ["pdp_nopump", "U1"],
            ["dpd_descstart", "U2"],
            ["dpd_descend", "U2"],
            ["dpd_novalve", "U1"],
            ["dpd_nopum", "U1"],
            ["dpd_maxpres", "U2"],
            ["dppp_noent", "U1"],
            ["dppp_norepos", "U1"],
            ["dppp_novalve", "U1"],
            ["dppp_nopump", "U1"],
            ["dppp_minpres", "U2"],
            ["dppp_maxpres", "U2"],
            ["ap_ascstart", "U2"],
            ["ap_ascend", "U2"],
            ["ap_nopump", "U1"],
            ["gi_ftime1", "U1"],
            ["gi_ftime2", "U1"],
            ["gi_ftime3", "U1"],
            ["gi_fdate1", "U1"],
            ["gi_fdate2", "U1"],
            ["gi_fdate3", "U1"],
            ["gi_pressensoroffset", "U1"],
            ["gi_intpres", "U1"],
            ["gi_battvoltdrop", "U1"],
            ["gi_rtcstate", "U1"],
            ["gi_problemcounter", "U1"],
            ["gi_oxysensorstatus", "U1"],
            ["gps_latdeg", "U1"],
            ["gps_latmin", "U1"],
            ["gps_latminfrac", "U2"],
            ["gps_latns", "U1"],
            ["gps_lngdeg", "U1"],
            ["gps_lngmin", "U1"],
            ["gps_lngfrac", "U2"],
            ["gps_lngew", "U1"],
            ["gps_validfix", "U1"],
            ["gps_sesduration", "U2"],
            ["gps_retries", "U1"],
            ["gps_pumpduration", "U2"],
            ["gps_antennastatus", "U1"],
            ["eoli_detflag", "U1"],
            ["eoli_starthour1", "U1"],
            ["eoli_starthour2", "U1"],
            ["eoli_starthour3", "U1"],
            ["eoli_startdate1", "U1"],
            ["eoli_startdate2", "U1"],
            ["eoli_startdate3", "U1"],
            ["eoli_notused1", "U1"],
            ["eoli_notused2", "U1"],
            ["eoli_notused3", "U1"],
        ]);

        static ReadTechnicaln1 = ParserA.CreateReader(ArgoSBD0.STRUCT_TECHNICAL_N1);

        static ParseSectionDescribe(dataView, offset, littleEndian) {
            const result = new Map();

            ArgoSBD0.ReadTechnicaln1._toDescribeMap(dataView, offset, result, littleEndian);

            return result;
        }
    }

    class ArgoSBD1 {
        static STRUCT_PROFILE_CTD_HEADER = new Map([
            ["type", "U1"],
            ["gi_cycleno", "U2"],
        ]);

        static STRUCT_PROFILE_CTD_SAMPLE_DATE = new Map([
            ["hour", 'U2'],
            ["min", 'U1'],
            ["sec", 'U1'],
        ]);

        static STRUCT_PROFILE_CTD_SAMPLE = new Map([
            ["pres", 'U2'],
            ["temp", 'U2'],
            ["sal", 'U2'],
        ]);

        static ReadProfileCTDHeader = ParserA.CreateReader(ArgoSBD1.STRUCT_PROFILE_CTD_HEADER);
        static ReadProfileCTDSampleDate = ParserA.CreateReader(ArgoSBD1.STRUCT_PROFILE_CTD_SAMPLE_DATE);
        static ReadProfileCTDSample = ParserA.CreateReader(ArgoSBD1.STRUCT_PROFILE_CTD_SAMPLE);

        static ParseSectionDescribe(dataView, offset, littleEndian) {
            const result = new Map();

            let offsetAdd = 0;
            ArgoSBD1.ReadProfileCTDHeader._toDescribeMap(dataView, offset + offsetAdd, result, littleEndian);
            offsetAdd = offsetAdd + ArgoSBD1.ReadProfileCTDHeader._size;
            ArgoSBD1.ReadProfileCTDSampleDate._toDescribeMap(dataView, offset + offsetAdd, result, littleEndian);
            offsetAdd = offsetAdd + ArgoSBD1.ReadProfileCTDSampleDate._size;

            for (let i = 0; i < 15; ++i) {
                const sample = new Map();
                ArgoSBD1.ReadProfileCTDSample._toDescribeMap(dataView, offset + offsetAdd, sample, littleEndian);
                offsetAdd = offsetAdd + ArgoSBD1.ReadProfileCTDSample._size;

                // ignore if its 0, 0, 0
                if (0 === sample.get('pres').v
                    && 0 === sample.get('temp').v
                    && 0 === sample.get('sal').v
                ) {
                    continue;
                }

                for (const [k, v] of sample.entries()) {
                    result.set(`${k}${i + 1}`, v);
                }
            }

            // do not check about complement 3 byte

            return result;
        }

        static ParseCTDPressure(pres) {
            return {
                v: pres / 10,
                unit: 'dBar'
            }
        }

        static ParseCTDTemperature(temp) {
            return {
                v: temp / 1000,
                unit: 'degreeCelsius'
            }
        }

        static ParseCTDSalinity(sal) {
            return {
                v: (sal + 10000) / 1000,
                unit: 'PSU',
            }
        }
    }

    class ArgoSBD {
        static littleEndian = false; // Default Big endian

        static TYPE_LENGTH = 1; // first 1 byte = packet type
        static SECTION_LENGTH = 100; // always 100 bytes
        static PACKET_TYPES = {
            0: { title: 'Technical packet n1', cls: ArgoSBD0 },
            1: { title: 'Descent CTD packet', cls: ArgoSBD1 },
            2: { title: 'Drift CTD packet', cls: ArgoSBD1 },
            3: { title: 'Ascent CTD packet', cls: ArgoSBD1 },
            4: { title: 'Technical packet n2', cls: undefined },
            5: { title: 'Float parameter packet', cls: undefined },
            6: { title: 'Hydraulic packet', cls: undefined },
        }

        static DescType(type) {
            return ArgoSBD.PACKET_TYPES[type]?.title ?? undefined;
        }

        static GetType(type) {
            return ArgoSBD.PACKET_TYPES[type];
        }

        // title will be ignored
        static CreateInvalidSection(title, type) {
            const map = new Map();
            map.set('type', { v: type, type: 'U1', size: 1 });
            return map;
        }

        // Entry point
        static ParseDescribe(dataView, offset = 0, littleEndian = ArgoSBD.littleEndian) {
            const length = dataView.byteLength;
            const shouldBeZero = length % ArgoSBD.SECTION_LENGTH;

            if (0 !== shouldBeZero) {
                console.info(`dataView expected to be multiple of 100 but its ${length} bytes, remain section will be ignored`);
            }

            const r = [];

            // very simple, 100 bytes each section
            for (let i = 0; i < length; i = i + 100) {
                const thisOffset = i + offset;
                const type = dataView.getUint8(thisOffset);
                const obj = ArgoSBD.GetType(type);
                if (!obj) {
                    r.push(ArgoSBD.CreateInvalidSection('Invalid section', type));
                } else {
                    if (obj.cls) {
                        const desc = obj.cls.ParseSectionDescribe(dataView, thisOffset, littleEndian);
                        // desc.set('title', obj.title);
                        r.push(desc);
                    } else {
                        r.push(ArgoSBD.CreateInvalidSection('Valid section but no cls implemented', type));
                    }
                }
            }

            return r;
        }
    }

    return {
        ArgoSBD,
        ArgoSBD0
    }
})();