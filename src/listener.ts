import WebSocket from "ws";
import { parse_table_rows, get_table_rows, get_actions, parse_actions } from "eosws";
import { updateVote, updateBlockNumber, updateVoter, updateProposal, updateTally, updateSelfDelegatedBandwidth, updateVoterInfo } from "./updaters";
import { DFUSE_IO_API_KEY } from "./config";
import { log, error } from "./utils";
import { getVotes } from "./boot";
import { Vote, Proposal } from "../types/eosforumrcpp";
import { Voters, Delband } from "../types/eosio";
import { state } from "./state";

/**
 * Listens to EOSIO table rows via dfuse.io WebSocket API
 *
 * @returns {void}
 */
export default function listener() {
    const origin = "https://api.eosvotes.io";
    const ws = new WebSocket(`wss://mainnet.eos.dfuse.io/v1/stream?token=${DFUSE_IO_API_KEY}`, {origin});

    ws.onopen = async () => {
        log({ref: "listener::open", message: "connection open"});
        const start_block = state.global.block_num;
        if (!start_block) throw new Error("[start_block] is required");

        // Listen on Table Rows
        ws.send(get_table_rows({code: "eosio", scope: "eosio", table_name: "voters"}, { req_id: "eosio::voters", start_block }));
        ws.send(get_table_rows({code: "eosforumrcpp", scope: "eosforumrcpp", table_name: "vote"}, { req_id: "eosforumrcpp::vote", start_block }));
        ws.send(get_table_rows({code: "eosforumrcpp", scope: "eosforumrcpp", table_name: "proposal"}, { req_id: "eosforumrcpp::proposal", start_block }));

        // Listen on Actions
        ws.send(get_actions({account: "eosforumrcpp", action_name: "unvote"}, { req_id: "eosforumrcpp::unvote", start_block }));

        // Listen on Self Delegated Bandwidth of all users
        for (const account_name of Object.keys(state.voters)) {
            ws.send(get_table_rows({code: "eosio", scope: account_name, table_name: "delband"}, { req_id: "eosio::delband", start_block }));
        }
    };

    ws.onmessage = async (message) => {
        const messageJSON = JSON.parse(message.data.toString());
        if (messageJSON.type === "error") error({ref: "listener", message: JSON.stringify(messageJSON.data)});

        const delband = parse_table_rows<Delband>(message.data, "eosio::delband");
        const voters = parse_table_rows<Voters>(message.data, "eosio::voters");
        const vote = parse_table_rows<Vote>(message.data, "eosforumrcpp::vote");
        const proposal = parse_table_rows<Proposal>(message.data, "eosforumrcpp::proposal");
        const unvote = parse_actions<any>(message.data, "eosforumrcpp::unvote");

        // eosio::voters
        if (voters) {
            const voter_info = voters.data.data;
            const { owner } = voter_info;

            if (state.voters[owner]) {
                log({ref: "listener::eosio::voters", message: owner});
                updateVoterInfo(owner, voter_info);
                updateBlockNumber(voters.data.block_num);
                updateTally();
            }
        }
        // eosio::delband
        if (delband) {
            const self_delegated_bandwidth = delband.data.data;
            const { from } = self_delegated_bandwidth;

            if (state.voters[from]) {
                log({ref: "listener::eosio::delband", message: from});
                updateSelfDelegatedBandwidth(from, self_delegated_bandwidth);
                updateBlockNumber(delband.data.block_num);
                updateTally();
            }
        }
        // eosforumrcpp::vote
        if (vote && vote.data.data) {
            const { voter, proposal_name } = vote.data.data;
            log({ref: "listener::eosforumrcpp::vote", message: `${voter} voted for ${proposal_name}`});

            // Register new accounts to `delband` websocket
            if (!state.voters[voter]) {
                ws.send(get_table_rows({code: "eosio", scope: voter, table_name: "delband"}, { req_id: "eosio::delband" }));
                await updateVoter(voter);
            }
            updateVote(vote.data.data);
            updateBlockNumber(vote.data.block_num);
            updateTally();
        }
        // eosforumrcpp::proposal
        if (proposal) {
            log({ref: "listener::eosforumrcpp::proposal", message: proposal.data.data.proposal_name});
            updateProposal(proposal.data.data);
            updateTally();
            updateBlockNumber(proposal.data.block_num);
        }

        // eosforumcpp::unvote
        if (unvote) {
            await getVotes();
            updateTally();
        }
    };

    ws.onclose = () => {
        log({ref: "listener", message: "connection closed"});
        listener();
    };
}
