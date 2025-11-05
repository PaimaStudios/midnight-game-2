import { proveTxLocally } from "./local-proving";

self.onmessage = async function(event) {
    console.log(`Prover worker started for: ${JSON.stringify(event.data)}`);

    proveTxLocally(event.data.baseUrl, event.data.tx, event.data.proveTxConfig)
        .then((tx) => {
            console.log(`worker prover done?!`);
            self.postMessage({ requestId: event.data.requestId, type: 'success', tx });
        })
        .catch((error) => {
            console.error(`worker error: ${JSON.stringify(error)} / ${error}`);
            self.postMessage({ requestId: event.data.requestId, type: 'error', error});
        });
};