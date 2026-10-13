#property copyright "Trading OS"
#property version "1.00"
#property strict
// Read-only exporter: no OrderSend, CTrade, position/order modification or DLLs.
input string Endpoint="https://trading-os-flame.vercel.app/api/mt5/sync";
input string ConnectionToken="";
input string ExpectedAccount="";
input string BrokerTimezone=""; // IANA timezone matching broker chart/history clock (ask broker)
input int SyncSeconds=300;
input bool DemoOnly=true;
string last_body="";
datetime last_success=0;
string Quote(string value){StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");StringReplace(value,"\r","\\r");StringReplace(value,"\n","\\n");StringReplace(value,"\t","\\t");return "\""+value+"\"";}
string Id(ulong value){return StringFormat("%I64u",value);}
string Day(datetime t){string value=TimeToString(t,TIME_DATE);StringReplace(value,".","-");return value;}
int OnInit(){if(ConnectionToken==""||ExpectedAccount==""||BrokerTimezone==""||SyncSeconds<60){Print("Trading OS: fill token, expected account and broker IANA timezone; interval minimum 60s.");return INIT_PARAMETERS_INCORRECT;}if(StringFind(Endpoint,"https://")!=0){Print("Trading OS: HTTPS endpoint required.");return INIT_PARAMETERS_INCORRECT;}if(Id((ulong)AccountInfoInteger(ACCOUNT_LOGIN))!=ExpectedAccount){Print("Trading OS: wrong account. Attach the matching account token.");return INIT_PARAMETERS_INCORRECT;}if(DemoOnly&&AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO){Print("Trading OS: DemoOnly enabled; this is not a demo account.");return INIT_PARAMETERS_INCORRECT;}EventSetTimer(SyncSeconds);return INIT_SUCCEEDED;}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){if(!TerminalInfoInteger(TERMINAL_CONNECTED))return;if(Id((ulong)AccountInfoInteger(ACCOUNT_LOGIN))!=ExpectedAccount){Print("Trading OS: account changed; no data sent.");return;}if(DemoOnly&&AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO)return;
 if(!HistorySelect(0,TimeCurrent())){Print("Trading OS: history selection failed.");return;}
 int count=HistoryDealsTotal();if(count>5000){Print("Trading OS: history exceeds 5000 deals; no partial snapshot sent. Contact support for paginated export.");return;}
 string body="{\"version\":1,\"account\":"+Quote(ExpectedAccount)+",\"server\":"+Quote(AccountInfoString(ACCOUNT_SERVER))+",\"currency\":"+Quote(AccountInfoString(ACCOUNT_CURRENCY))+",\"mode\":"+Quote(AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO?"demo":"live")+",\"balance\":"+DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),8)+",\"timezone\":"+Quote(BrokerTimezone)+",\"deals\":[";
 for(int i=0;i<count;i++){ulong ticket=HistoryDealGetTicket(i);if(ticket==0){Print("Trading OS: incomplete deal history; no data sent.");return;}datetime date=(datetime)HistoryDealGetInteger(ticket,DEAL_TIME);if(i>0)body+=",";
 body+="{\"ticket\":"+Quote(Id(ticket))+",\"position\":"+Quote(Id((ulong)HistoryDealGetInteger(ticket,DEAL_POSITION_ID)))+",\"symbol\":"+Quote(HistoryDealGetString(ticket,DEAL_SYMBOL))+",\"type\":"+IntegerToString((int)HistoryDealGetInteger(ticket,DEAL_TYPE))+",\"entry\":"+IntegerToString((int)HistoryDealGetInteger(ticket,DEAL_ENTRY))+",\"date\":"+Quote(Day(date))+",\"time\":"+Quote(TimeToString(date,TIME_MINUTES))+",\"volume\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_VOLUME),8)+",\"price\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_PRICE),10)+",\"profit\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_PROFIT),8)+",\"commission\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_COMMISSION),8)+",\"swap\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_SWAP),8)+",\"fee\":"+DoubleToString(HistoryDealGetDouble(ticket,DEAL_FEE),8)+"}";}
 body+="],\"openPositionIds\":[";int positions=PositionsTotal();for(int i=0;i<positions;i++){if(PositionGetTicket(i)==0){Print("Trading OS: could not read current positions.");return;}if(i>0)body+=",";body+=Quote(Id((ulong)PositionGetInteger(POSITION_IDENTIFIER)));}body+="]}";
 if(body==last_body&&TimeLocal()-last_success<3600)return;
 char data[],result[];StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,ArraySize(data)-1);string headers="Content-Type: application/json\r\nAuthorization: Bearer "+ConnectionToken+"\r\n",result_headers;ResetLastError();int status=WebRequest("POST",Endpoint,headers,15000,data,result,result_headers);
 if(status==200){last_body=body;last_success=TimeLocal();Print("Trading OS: account ",ExpectedAccount," synced; ",count," history deals.");}else{Print("Trading OS: sync failed. HTTP ",status,"; MT5 error ",GetLastError(),". Check allowed WebRequest URL, account token and broker timezone. No orders were placed.");}}
