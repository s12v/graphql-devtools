export default {
    network: {
        onRequestFinished: {
            addListener: (fun) => {
                fun(
                    {
                        request: {
                            url: 'http://example.foo',
                            httpVersion: 'http2',
                            headers: [
                                {
                                    name: 'content-type',
                                    value: 'application/json'
                                }
                            ],
                            method: 'POST',
                            postData: {
                                text: '{"query": "query {foo}", "variables": "{\\"a\\": \\"b\\"}"}'
                            }
                        },
                        response: {
                            content: {
                                size: 478
                            },
                            headers: [
                                {
                                    name: 'content-type',
                                    value: 'application/json'
                                }
                            ],
                            status: 200,
                        },
                        time: 448.23,
                        getContent: (fun) => {
                            fun('{\n' +
                                '  "data": {\n' +
                                '    "graphQLHub": "Foo bar"\n' +
                                '  }\n' +
                                '}');
                        }
                    }
                )
            }
        }
    }
};
