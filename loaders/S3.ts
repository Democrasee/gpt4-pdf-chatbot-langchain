import {
  S3Client,
  GetObjectCommand,
  paginateListObjectsV2,
  _Object,
} from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { BaseDocumentLoader } from 'langchain/document_loaders';
import { Document } from 'langchain/document';
import path from 'path';

const REGION = 'us-east-1';
const BUCKET = 'democrasee-storage';

const s3Client = new S3Client({
  region: REGION,
  credentialDefaultProvider: fromEnv,
});

export class S3RecursiveLoader extends BaseDocumentLoader {
  constructor(
    public filePathOrBlob: string,
    public filter: (object: _Object) => boolean,
    public maxKeys: number,
  ) {
    super();
  }

  private parseBillKey(key: string) {
    const regex =
      /raw\/congress\/data\/(?<congress>\d+)\/bills\/(?<type>\w+)\/\D+(?<number>\d+)\/text-versions\/(?<version>\w+)\/document.txt/gm;

    const result = regex.exec(key);

    if (result?.groups) {
      const { congress, type, number, version } = result.groups;

      return { congress, type, number, version };
    }

    return null;
  }

  public async load(): Promise<Document[]> {
    const paginator = paginateListObjectsV2(
      { client: s3Client },
      {
        Bucket: BUCKET,
        Prefix: this.filePathOrBlob,
      },
    );

    const objects: _Object[] = [];

    for await (const page of paginator) {
      if (page.Contents) {
        objects.push(...page.Contents);
      }
    }

    const documents: Document[] = [];

    for (const object of objects) {
      if (this.filter(object) && object.Key) {
        const command = new GetObjectCommand({
          Bucket: BUCKET,
          Key: object.Key,
        });

        const output = await s3Client.send(command);

        if (output.Body) {
          const text = await output.Body.transformToString();

          const text_version_dir = path.dirname(object.Key);
          const bill_dir = path.dirname(path.dirname(text_version_dir));

          const [text_version_data_output, bill_data_output] =
            await Promise.all([
              await s3Client.send(
                new GetObjectCommand({
                  Bucket: BUCKET,
                  Key: path.join(text_version_dir, 'data.json'),
                }),
              ),
              s3Client.send(
                new GetObjectCommand({
                  Bucket: BUCKET,
                  Key: path.join(bill_dir, 'data.json'),
                }),
              ),
            ]);

          const text_version_data_string =
            await text_version_data_output.Body?.transformToString();
          const bill_data_string =
            await bill_data_output.Body?.transformToString();

          const text_version_data = text_version_data_string
            ? JSON.parse(text_version_data_string)
            : {};
          const bill_data = bill_data_string
            ? JSON.parse(bill_data_string)
            : {};

          documents.push(
            new Document({
              pageContent: text,
              metadata: {
                source: object.Key,
                congress: bill_data.congress,
                bill_version: text_version_data.version_code,
                bill_version_id: text_version_data.bill_version_id,
                bill_id: bill_data.bill_id,
                introduced_at: bill_data.introduced_at,
                number: bill_data.number,
                official_title: bill_data.official_title,
                bill_version_issued_on: text_version_data.issued_on,
                bill_version_url: text_version_data.urls.unknown,
              },
            }),
          );
        }
      }

      if (documents.length === this.maxKeys) {
        return documents;
      }
    }

    return documents;
  }
}
