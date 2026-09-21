import 'package:flutter_test/flutter_test.dart';
import 'package:used_books_flutter/main.dart';

void main() {
  testWidgets('shows the project scaffold', (tester) async {
    await tester.pumpWidget(const UsedBooksApp());

    expect(find.text('Used-Book Marketplace'), findsOneWidget);
    expect(find.text('Flutter member application'), findsOneWidget);
  });
}
