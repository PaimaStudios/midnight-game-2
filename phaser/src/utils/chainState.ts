import axios from  'axios';

/**
 * Gets the current block height from the connected network
 */
export const getCurrentBlockHeight = (): Promise<bigint> => {
  const indexerGraphQLUrl = import.meta.env.VITE_BATCHER_MODE_INDEXER_HTTP_URL!;
  return axios.post(indexerGraphQLUrl, {
    query: "query {\n\tblock {\n\t\theight\n\t}\n}",
  }).then((response) => BigInt(response.data.data.block.height));
}