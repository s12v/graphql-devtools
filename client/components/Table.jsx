import HarUtils from "../services/HarUtils";
import React from 'react';
import ReactTable from "react-table";
import 'react-table/react-table.css'
import './styles/table.scss';

export default class Table extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            data: []
        };
    }

    componentDidMount() {
        if (typeof this.props.onRequestFinished !== 'undefined') {
            this.props.onRequestFinished.addListener(this.handleRequest.bind(this));
        }
    }

    handleRequest(har) {
        if (!HarUtils.getGraphQLQuery(har)) {
            return;
        }

        this.setState(
            prevState => {
                return {
                    data: [...prevState.data, {
                        har: har,
                        query: har.request.url,
                        test: har.request.httpVersion,
                    }]
                }
            }
        )
    }

    render() {
        const {data} = this.state;
        const columns = [{
            Header: 'Query',
            accessor: 'query'
        }, {
            Header: 'Hm',
            accessor: 'test',
            //Cell: props => <span className='number'>{props.value}</span> // Custom cell components!
        }];

        return <ReactTable
            className="-striped -highlight"
            showPagination={false}
            sortable={false}
            data={data}
            columns={columns}
            minRows={0}
            getTdProps={(state, rowInfo, column, instance) => {
                return {
                    onClick: (e, handleOriginal) => {
                        if (this.props.onClick) {
                            this.props.onClick(state.data[rowInfo.index].har);
                        }
                        if (handleOriginal) {
                            handleOriginal()
                        }
                    }
                }
            }}

        />
    }
}
