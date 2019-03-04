export default class HarUtils {

    static postData(har) {
        return har.hasOwnProperty('request')
        && har.request.hasOwnProperty('postData')
        && har.request.postData.hasOwnProperty('text') ? har.request.postData.text : '';
    }

    static isJson(har) {
        return HarUtils.isContentType(har, 'application/json');
    }

    static isContentType(har, contentType) {
        const lowercaseContentType = contentType.toLowerCase();
        return har.request.headers.some(header => {
            return header.name.toLowerCase() === 'content-type'
                && header.value.split(';')[0].toLowerCase() === lowercaseContentType;
        })
    }

    static parseVariables(jsonStringOrObject) {
        try {
            return 'object' === typeof jsonStringOrObject ? jsonStringOrObject : JSON.parse(jsonStringOrObject);
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e;
        }
        return {};
    }

    static getGraphQLQueries(har) {
        if (!this.isJson(har)) {
            return [];
        }

        try {
            let data = this.postData(har)
            data = typeof data === 'string' ? data.replace(/\r?\n|\r/g, '') : data;
            data = typeof data === 'string' ? JSON.parse(data) : data;
            data = Array.isArray(data) ? data : [data];
            let queries = [];

            data.forEach(query => {
                if (query.hasOwnProperty('query')) {
                    queries.push({
                        query: query.query,
                        operation: query.operationName,
                        variables: query.hasOwnProperty('variables') ? this.parseVariables(query.variables) : {}
                    });
                }
            });

            return queries;

        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return [];
    }
}
