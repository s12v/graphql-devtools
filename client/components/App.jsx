import React from 'react';
import Table from './Table';
import HarUtils from '../services/HarUtils';
import {GraphqlCodeBlock} from 'graphql-syntax-highlighter-react';

import './styles/app.scss';

export default class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            query: 'query {graphQLHub}'
        };
    }

    componentDidMount() {
        // if (typeof this.props.onRequestFinished !== 'undefined') {
        //     this.props.onRequestFinished.addListener(this.handleRequest.bind(this));
        // }
    }

    onRowClick(har) {
        console.log(har);

        const query = HarUtils.getGraphQLQuery(har);
        if (query !== null) {
            console.log("this is graphql!");
            this.setState(prevState => {
                    return {query: query}
                }
            );
        } else {
            console.log("this is NOT graphql!");
        }

    }

    render() {
        const {query} = this.state;
        return <div className="flex-container">
            <div className="left">
                <Table
                    onRequestFinished={this.props.onRequestFinished}
                    onClick={this.onRowClick.bind(this)}
                />
            </div>
            <div className="right">
                <GraphqlCodeBlock
                    className="GraphqlCodeBlock"
                    queryBody={query}
                />;
            </div>
        </div>;
    }
}
