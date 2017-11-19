export default class HarUtils {

    static postData(har) {
        return har.request.postData.text;
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

    static getGraphQLQuery(har) {
        if (!this.isJson(har)) {
            return {};
        }

        let query = {};
        try {
            const data = JSON.parse(this.postData(har));
            console.log(data);
            if (data.hasOwnProperty('query')) {
                query = Object.assign(query, {query: data.query});
            }
            if (data.hasOwnProperty('variables')) {
                query = Object.assign(query, {variables: data.variables});
            }
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return query;
    }
}
