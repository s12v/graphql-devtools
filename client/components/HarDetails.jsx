import React from 'react';

import './styles/har_details.scss';


export default class HarDetails extends React.Component {

    element(title, value) {
        return <div><b>{title}:</b> {value}</div>

    }

    render() {
        const {har} = this.props;

        return <div className="HarDetails">
            <div className="groupHeader">Request</div>
            <div className="groupContainer">
                {this.element('Request URL', har.request.url)}
                {this.element('Method', har.request.method)}
                {this.element('HTTP version', har.request.httpVersion)}
                <div className="subGroupHeader">Headers:</div>
                <div className="subgroupContainer">
                    {
                        har.request.headers.map(header => {
                            return this.element(header.name, header.value)
                        })
                    }
                </div>
            </div>
            <div className="groupHeader">Response</div>
            <div className="groupContainer">
                {this.element('Status', har.response.status)}
                <div className="subGroupHeader">Headers:</div>
                <div className="subgroupContainer">
                    {
                        har.response.headers.map(header => {
                            return this.element(header.name, header.value)
                        })
                    }
                </div>
            </div>
        </div>;
    }
};
