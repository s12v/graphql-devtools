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
            return false;
        }

        try {
            const data = JSON.parse(this.postData(har));
            if (data.hasOwnProperty('query')) {
                return data.query;
            }
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return null;
    }
}
