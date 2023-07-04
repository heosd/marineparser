const app = (() => {
    // -- for devs
    if (!window.ParserEM && window.MarineParser) {
        window.ParserEM = MarineParser.ParserEM;
    }

    async function loadTest() {
        const list = [
            '/raw/em/0055.mb58',
            '/raw/em/0036.mb58',
            '/raw/em/0001.mb56',
        ];

        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            const r = await fetch(f);
            const ab = await r.arrayBuffer();
            const rr = ParserEM.ParseMeta(ab);
            console.log(rr);
        }
    }

    async function onChangeFile(input) {
        const files = input.files;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const ab = await f.arrayBuffer();
            const rr = ParserEM.ParseMeta(ab);
            console.log(rr);
        }
    }

    function main() {
        if (!ParserEM) {
            console.error('Can not load multibeam meta app');
        } else {
            loadTest();
        }
    }

    main();

    return {
        onChangeFile: onChangeFile
    }
})();