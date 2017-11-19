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
                && header.value.split(';')[0].toLowerCase() === lowercaseContentType
        })
    }

    static parseVariables(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return {};
    }

    static getGraphQLQuery(har) {
        if (this.isJson(har)) {
            return {};
        }

        try {
            const data = JSON.parse(this.postData(har));
            if (data.hasOwnProperty('query')) {
                return {
                    query: data.query,
                    variables: data.hasOwnProperty('variables') ? this.parseVariables(data.variables) : {}
                };
            }
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return {};
    }
}
