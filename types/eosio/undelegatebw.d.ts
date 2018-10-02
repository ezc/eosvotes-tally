import { Authorization } from "./eosio";

// Generated by https://quicktype.io
//
// To change quicktype's target language, run command:
//
//   "Set quicktype target language"

export interface Undelegatebw {
    transactionId: string;
    actionIndex: number;
    account: string;
    name: string;
    authorization: Authorization[];
    data: UndelegatebwData;
}

export interface UndelegatebwData {
    from: string;
    receiver: string;
    unstake_net_quantity: string;
    unstake_cpu_quantity: string;
}
