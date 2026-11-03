import { Document,Page,StyleSheet,Text,View } from "@react-pdf/renderer";
const styles=StyleSheet.create({page:{padding:32,fontFamily:'Helvetica',fontSize:8,color:'#070709'},title:{fontSize:20,marginBottom:8},muted:{color:'#60606c',marginBottom:16},section:{fontSize:12,marginTop:16,marginBottom:10},row:{flexDirection:'row',borderBottomWidth:.5,borderBottomColor:'#e5e7eb',paddingVertical:7},date:{width:'16%'},party:{width:'31%'},state:{width:'26%'},amount:{width:'27%',textAlign:'right'},footer:{position:'absolute',bottom:18,left:32,right:32,fontSize:7,color:'#60606c'}});
export type SummaryPdfData={title:string;company:string;period:string;scope:string;forecastTitle:string;forecasts:{label:string;date:string;amount:string}[];movementsTitle:string;rows:{id:string;date:string;party:string;state:string;amount:string}[];empty:string};
export function FinanceSummaryDocument({data}:{data:SummaryPdfData}) {
  return <Document title={data.title}><Page size="A4" style={styles.page} wrap><Text style={styles.title}>{data.title}</Text><Text>{data.company}</Text><Text style={styles.muted}>{data.period}</Text>
    <Text style={styles.section}>{data.forecastTitle}</Text>{data.forecasts.map((f,i)=><View key={i} style={styles.row} wrap={false}><Text style={styles.party}>{f.label}</Text><Text style={styles.state}>{f.date}</Text><Text style={styles.amount}>{f.amount}</Text></View>)}
    <Text style={styles.section}>{data.movementsTitle}</Text><Text style={styles.muted}>{data.scope}</Text>
    {data.rows.map((row)=><View key={row.id} style={styles.row} wrap={false}><Text style={styles.date}>{row.date}</Text><Text style={styles.party}>{row.party}</Text><Text style={styles.state}>{row.state}</Text><Text style={styles.amount}>{row.amount}</Text></View>)}
    {!data.rows.length&&<Text>{data.empty}</Text>}<Text style={styles.footer} fixed render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`}/>
  </Page></Document>;
}
