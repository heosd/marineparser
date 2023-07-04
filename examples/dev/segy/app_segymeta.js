const app = (() => {
    // -- for devs
    if (!window.ParserSEGY && window.MarineParser) {
        window.ParserSEGY = MarineParser.ParserSEGY;
    }

    async function loadTest() {
        const list = [
            '/raw/segy/3.SGY',
        ];

        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            const r = await fetch(f);
            const ab = await r.arrayBuffer();
            const rr = ParserSEGY.ParseMeta(ab);
            console.log(rr);
        }
    }

    async function onChangeFile(input) {
        const files = input.files;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const ab = await f.arrayBuffer();
            const rr = ParserSEGY.ParseMeta(ab);
            console.log(rr);
        }
    }

    function main() {
        if (!ParserSEGY) {
            console.error('Can not load segy meta app');
        } else {
            loadTest();
        }
    }

    main();

    return {
        onChangeFile: onChangeFile
    }
})();