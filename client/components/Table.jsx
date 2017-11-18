import HarUtils from "../services/HarUtils";
import React from 'react';
import ReactTable from "react-table";
import formatBytes from "../services/FormatBytes"
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
                        url: har.request.url,
                        status: har.response.status,
                        size: har.response.content.size,
                        time: har.time,
                    }]
                }
            }
        )
    }

    render() {
        const {data} = this.state;
        const columns = [
            {
                Header: 'URL',
                accessor: 'url'
            },
            {
                Header: 'Status',
                accessor: 'status',
                maxWidth: 100,
            },
            {
                Header: 'Size',
                accessor: 'size',
                maxWidth: 100,
                Cell: props => <span>{formatBytes(props.value)}</span>
            },
            {
                Header: 'Time',
                accessor: 'time',
                maxWidth: 100,
                Cell: props => <span>{Math.round(props.value)}&nbsp;ms</span>
            }
        ];

        return <ReactTable
            className="-striped -highlight"
            showPagination={false}
            sortable={true}
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
